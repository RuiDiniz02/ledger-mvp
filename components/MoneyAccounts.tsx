'use client';

import { useEffect, useRef, useState } from 'react';
import { accountAge, accountTotals, activeAccounts, parseAccountBalance, staleAccountCount } from '@/lib/accounts';
import { dailyBudget, fold, uid, ymNow } from '@/lib/data';
import { money, parseMoney } from '@/lib/format';
import { makeT, type T } from '@/lib/i18n';
import type { Ledger, MoneyAccount, MoneyAccountKind } from '@/lib/types';

const kinds: MoneyAccountKind[] = ['spending', 'saving', 'investment'];
const kindKey = { spending: 'moneySpending', saving: 'moneySaving', investment: 'moneyInvested' } as const;
const kindHelp = { spending: 'moneySpendingHelp', saving: 'moneySavingHelp', investment: 'moneyInvestedHelp' } as const;
const kindStyle = {
  spending: { background: '#e1f2ef', color: '#1d7166' },
  saving: { background: '#e8edfc', color: '#4e5dac' },
  investment: { background: '#f0e9f9', color: '#865baa' },
};
const field = 'mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3.5 text-base text-ink';
const action = 'min-h-12 w-full rounded-2xl bg-deep px-4 py-3 text-sm font-semibold text-white disabled:opacity-40';

function AccountMark({ kind }: { kind: MoneyAccountKind }) {
  return <span aria-hidden='true' className='grid h-10 w-10 shrink-0 place-items-center rounded-xl' style={kindStyle[kind]}>
    <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round'>
      {kind === 'spending' ? <><rect x='3' y='5' width='18' height='14' rx='3' /><path d='M3 10h18M7 15h3' /></>
        : kind === 'saving' ? <><rect x='5' y='9' width='14' height='11' rx='3' /><path d='M8 9V6a4 4 0 0 1 8 0v3M12 14v2' /></>
        : <><path d='M4 20h16M6 16v-4M12 16V8M18 16V4' /></>}
    </svg>
  </span>;
}

function Confirmed({ account, t }: { account: MoneyAccount; t: T }) {
  const age = accountAge(account);
  const label = age === 0 ? t('moneyConfirmedToday') : t('moneyConfirmedDays', { n: age });
  return <time dateTime={account.confirmedAt} className={'text-xs ' + (age >= 7 ? 'text-[#986017]' : 'text-[#63757d]')}>{label}</time>;
}

/** One entry point on Overview; no extra tab and no change to the expense flow. */
export function MoneySummary({ ledger, onOpen }: { ledger: Ledger; onOpen: () => void }) {
  const t = makeT(ledger.lang);
  const totals = accountTotals(ledger);
  if (!totals.count) return <button onClick={onOpen} className='mt-3 flex w-full items-center gap-3 rounded-[20px] border border-black/[0.06] bg-white p-4 text-left'>
    <AccountMark kind='spending' />
    <span className='flex-1'><span className='block text-sm font-semibold text-ink'>{t('moneyEmptyTitle')}</span><span className='mt-1 block text-xs leading-relaxed text-[#63757d]'>{t('moneyEmptyBody')}</span></span>
    <span aria-hidden='true' className='text-xl text-[#63757d]'>›</span>
  </button>;
  return <button onClick={onOpen} className='mt-3 block w-full rounded-[20px] border border-black/[0.06] bg-white p-4 text-left'>
    <span className='flex items-center justify-between gap-3'><span className='text-sm font-semibold text-ink'>{t('moneyTitle')}</span><span className='text-xs font-semibold text-[#0b7b8f]'>{t('moneyOpen')} ›</span></span>
    <span className='mt-3 flex flex-wrap items-baseline justify-between gap-2'><span className='font-mono text-[25px] tracking-tight text-ink'>{money(totals.total, true, ledger.lang)}</span><span className='text-xs text-[#63757d]'>{t('moneyAccountCount', { n: totals.count })}</span></span>
    <span className='mt-3 grid grid-cols-3 gap-2 border-t border-black/[0.06] pt-3'>
      {kinds.map(kind => <span key={kind}><span className='block text-[11px] text-[#63757d]'>{t(kindKey[kind])}</span><span className='mt-1 block break-all font-mono text-[13px] text-ink'>{money(totals[kind === 'investment' ? 'invested' : kind], true, ledger.lang)}</span></span>)}
    </span>
    <span className='mt-3 block text-[11px] leading-relaxed text-[#63757d]'>{staleAccountCount(ledger) ? t('moneyStale') : t('moneyManual')}</span>
  </button>;
}

type Draft = { id: string | null; name: string; kind: MoneyAccountKind; balance: string; reserved: string; reserveOn: boolean; confirmed: boolean };
const newDraft = (): Draft => ({ id: null, name: '', kind: 'spending', balance: '', reserved: '', reserveOn: false, confirmed: false });

export function MoneyAccounts({ ledger, update }: { ledger: Ledger; update: (fn: (d: Ledger) => void) => void }) {
  const t = makeT(ledger.lang);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [notice, setNotice] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  // Keep focus in the same dialog when moving between its list and editor.
  const editor = draft ? draft.id ?? 'new' : 'list';
  useEffect(() => { heading.current?.focus(); }, [editor]);
  const accounts = activeAccounts(ledger);
  const hidden = (ledger.moneyAccounts ?? []).filter(a => a.archived);
  const totals = accountTotals(ledger);
  const limit = (ledger.moneyAccounts ?? []).length >= 100;
  const format = (value: number) => money(value, true, ledger.lang);
  const edit = (account: MoneyAccount) => {
    setNotice('');
    setDraft({ id: account.id, name: account.name, kind: account.kind, balance: String(account.balance / 100), reserved: String(account.reserved / 100), reserveOn: account.reserved > 0, confirmed: false });
  };
  const hide = (id: string, archived: boolean) => {
    const restoring = ledger.moneyAccounts?.find(a => a.id === id);
    if (!archived && restoring && accounts.some(a => fold(a.name.trim()) === fold(restoring.name.trim()))) { setNotice(t('moneyDuplicate')); return; }
    update(d => { const a = d.moneyAccounts?.find(a => a.id === id); if (a) a.archived = archived; });
    setDraft(null);
    setNotice(t(archived ? 'moneyArchived' : 'moneyRestored'));
    if (!archived) heading.current?.focus();
  };
  const balance = draft ? parseAccountBalance(draft.balance) : null;
  const reserved = draft?.kind === 'spending' && draft.reserveOn ? parseMoney(draft.reserved || '0') : 0;
  const duplicate = !!draft && accounts.some(a => a.id !== draft.id && fold(a.name.trim()) === fold(draft.name.trim()));
  const error = !draft ? '' : duplicate ? t('moneyDuplicate')
    : draft.balance && balance === null ? t('invalidAmount')
    : balance !== null && balance < 0 && draft.kind !== 'spending' ? t('moneyInvalidNegative')
    : reserved === null ? t('invalidAmount')
    : balance !== null && reserved > Math.max(0, balance) ? t('moneyInvalidReserved') : '';
  const canSave = !!draft?.name.trim() && balance !== null && reserved !== null && !error;
  const existing = draft?.id ? ledger.moneyAccounts?.find(a => a.id === draft.id) : undefined;
  const confirming = !existing || balance !== existing.balance || draft?.confirmed;

  const save = () => {
    if (!draft || !canSave || balance === null || reserved === null || (!draft.id && limit)) return;
    const next: MoneyAccount = { id: draft.id ?? uid('account'), name: draft.name.trim(), kind: draft.kind, balance, reserved,
      confirmedAt: confirming ? new Date().toISOString() : existing!.confirmedAt };
    update(d => {
      const list = d.moneyAccounts ?? [];
      d.moneyAccounts = draft.id ? list.map(a => a.id === draft.id ? next : a) : [...list, next];
    });
    setDraft(null);
    setNotice(t(confirming ? 'moneySaved' : 'moneyDetailsSaved'));
  };

  return <div>
    {notice && <p role='status' className='mb-4 rounded-xl bg-[#e1f2ef] p-3 text-sm text-[#1d7166]'>{notice}</p>}
    {draft ? <>
      <button type='button' onClick={() => setDraft(null)} className='mb-2 min-h-11 text-sm font-semibold text-[#0b7b8f]'>‹ {t('back')}</button>
      <h3 ref={heading} tabIndex={-1} className='mb-5 text-xl font-bold text-ink outline-none'>{t(draft.id ? 'moneyEdit' : 'moneyNew')}</h3>
      <form onSubmit={e => { e.preventDefault(); save(); }} className='space-y-5'>
        <div><label htmlFor='money-account-name' className='text-sm font-semibold'>{t('moneyName')}</label>
          <input id='money-account-name' autoComplete='off' maxLength={60} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder={t('moneyNamePh')} className={field} required />
        </div>
        <fieldset><legend className='mb-2 text-sm font-semibold'>{t('moneyPurpose')}</legend>
          <div className='grid grid-cols-3 gap-2'>{kinds.map(kind => <label key={kind} className={'flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border px-1.5 text-xs font-semibold focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-2 ' + (draft.kind === kind ? 'border-deep bg-deep text-white' : 'border-black/10 bg-white text-ink')}>
            <input type='radio' name='money-kind' value={kind} checked={draft.kind === kind} onChange={() => setDraft({ ...draft, kind })} className='sr-only' />
            {t(kindKey[kind])}
          </label>)}</div>
          <p className='mt-2 text-xs leading-relaxed text-[#63757d]'>{t(kindHelp[draft.kind])}</p>
        </fieldset>
        <div><label htmlFor='money-account-balance' className='text-sm font-semibold'>{t('moneyBalance')}</label>
          <input id='money-account-balance' inputMode='decimal' value={draft.balance} onChange={e => setDraft({ ...draft, balance: e.target.value })} aria-describedby='money-balance-help' aria-invalid={!!draft.balance && balance === null} placeholder='0,00' className={field + ' font-mono'} required />
          <p id='money-balance-help' className='mt-2 text-xs leading-relaxed text-[#63757d]'>{t('moneyBalanceHelp')}</p>
        </div>
        {draft.kind === 'spending' && <div className='rounded-2xl border border-black/[0.06] bg-white p-4'>
          <label className='flex min-h-6 cursor-pointer items-center gap-3 text-sm'><input type='checkbox' checked={draft.reserveOn} onChange={e => setDraft({ ...draft, reserveOn: e.target.checked })} className='h-4 w-4 accent-deep' />{t('moneyReservedToggle')}</label>
          {draft.reserveOn && <div className='mt-4'><label htmlFor='money-account-reserved' className='text-sm font-semibold'>{t('moneyReserved')}</label><input id='money-account-reserved' inputMode='decimal' value={draft.reserved} onChange={e => setDraft({ ...draft, reserved: e.target.value })} className={field + ' font-mono'} placeholder='0,00' /><p className='mt-2 text-xs leading-relaxed text-[#63757d]'>{t('moneyReservedHelp')}</p></div>}
        </div>}
        {existing && balance === existing.balance && <label className='flex min-h-11 cursor-pointer items-center gap-3 text-sm'><input type='checkbox' checked={draft.confirmed} onChange={e => setDraft({ ...draft, confirmed: e.target.checked })} className='h-4 w-4 accent-deep' />{t('moneyConfirmCheck')}</label>}
        {error && <p role='alert' className='text-sm text-[#9b2440]'>{error}</p>}
        <button type='submit' disabled={!canSave} className={action}>{t(confirming ? 'moneySave' : 'moneyOnlyDetails')}</button>
        {existing && <button type='button' onClick={() => hide(existing.id, true)} className='min-h-11 w-full text-sm text-[#63757d]'>{t('moneyArchive')}</button>}
      </form>
    </> : <>
      <h3 ref={heading} tabIndex={-1} className='mb-4 text-sm leading-relaxed text-[#63757d] outline-none'>{t('moneyIntro')}</h3>
      {!!accounts.length && <>
        <div className='rounded-[22px] bg-deep p-5 text-white'><p className='text-xs text-white/75'>{t('moneyTotal')}</p><p className='mt-1 break-all font-mono text-[30px]'>{format(totals.total)}</p>
          <dl className='mt-4 space-y-2.5 border-t border-white/15 pt-4'>{kinds.map(kind => <div key={kind} className='flex justify-between gap-3 text-sm'><dt>{t(kindKey[kind])}</dt><dd className='font-mono'>{format(totals[kind === 'investment' ? 'invested' : kind])}</dd></div>)}</dl>
        </div>
        {totals.spending < 0 && <p className='mt-3 text-sm text-[#9b2440]'>{t('moneyNegativeNotice')}</p>}
        <p className='my-4 text-xs leading-relaxed text-[#63757d]'>{t('moneyManual')}</p>
        <div className='mb-4 space-y-2'>{accounts.map(account => <button key={account.id} onClick={() => edit(account)} className='flex w-full items-center gap-3 rounded-2xl border border-black/[0.06] bg-white p-3.5 text-left'>
          <AccountMark kind={account.kind} />
          <span className='min-w-0 flex-1'><span className='block break-words text-sm font-semibold'>{account.name}</span><span className='mt-1 block text-xs text-[#63757d]'>{t(kindKey[account.kind])}</span><span className='mt-1 block'><Confirmed account={account} t={t} /></span></span>
          <span className='max-w-[45%] text-right'><span className='block break-all font-mono text-sm'>{format(account.balance)}</span>{account.reserved > 0 && <span className='mt-1 block text-[11px] text-[#63757d]'>{t('moneySaving')} {format(account.reserved)}</span>}</span><span aria-hidden='true' className='text-[#63757d]'>›</span>
        </button>)}</div>
      </>}
      <button onClick={() => { setNotice(''); setDraft(newDraft()); }} disabled={limit} className={action}>+ {t('moneyAdd')}</button>
      {limit && <p className='mt-2 text-sm text-[#9b2440]'>{t('moneyLimit')}</p>}
      <p className='mt-4 text-sm leading-relaxed text-[#63757d]'>{t('moneySnapshotHelp')}</p>
      {!!accounts.length && <details className='mt-4 rounded-2xl border border-black/[0.06] bg-white p-4 text-sm'>
        <summary className='cursor-pointer font-semibold text-deep'>{t('moneyBudgetAmount')}</summary>
        <p className='mt-3 font-mono text-xl'>{format(dailyBudget(ledger, ymNow()).spendable)}</p>
        <p className='mt-2 leading-relaxed text-[#63757d]'>{t('moneyBudgetHelp')}</p>
        <p className='mt-2 leading-relaxed text-[#63757d]'>{t('moneyComparison')}</p>
      </details>}
      {!!hidden.length && <details className='mt-4 text-sm'><summary className='min-h-11 cursor-pointer py-3 text-[#63757d]'>{t('moneyHidden', { n: hidden.length })}</summary><div className='space-y-2'>{hidden.map(a => <div key={a.id} className='flex items-center justify-between gap-3 rounded-xl bg-white p-3'><span className='break-words'>{a.name}</span><button onClick={() => hide(a.id, false)} className='min-h-11 shrink-0 px-2 font-semibold text-[#0b7b8f]'>{t('moneyRestore')}</button></div>)}</div></details>}
    </>}
  </div>;
}

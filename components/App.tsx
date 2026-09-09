'use client';

import { useEffect, useState } from 'react';
import { Tile, TabIcon } from './Icons';
import Onboarding from './Onboarding';
import { useLedger } from '@/lib/store';
import { money, dayLabel } from '@/lib/format';
import {
  PALETTE, MARKS, allocated, catState, ensureMonth, iso, makeCategory, monthBudget, monthMeta,
  shiftYm, spentBy, totalSpent, txOfMonth, unsettled, ymLabel, ymNow, ymOf,
} from '@/lib/data';
import { makeT } from '@/lib/i18n';
import type { Category, Kind, Lang, Ledger, Tx } from '@/lib/types';

const WARN_AT = 80;
const CARD = 'rounded-[20px] border border-black/[0.06] bg-white';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b969b]';

type Screen = 'home' | 'activity' | 'budget' | 'me' | 'detail';
type Draft = { amount: string; cat: string; date: string; note: string; scope: 'mine' | 'split'; pct: number };
type CatForm = { id: string | null; name: string; kind: Kind; ci: number; target: string };

const toCents = (s: string) => Math.round((parseFloat((s || '').replace(',', '.')) || 0) * 100);
const fromCents = (c: number) => (c ? String(c / 100) : '');

export default function App() {
  const { data, update, reset } = useLedger();
  const [screen, setScreen] = useState<Screen>('home');
  const [ym, setYm] = useState<string>(ymNow());
  const [detail, setDetail] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'log' | 'tx' | 'cat'>(null);
  const [viewTx, setViewTx] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine' | 'split'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ amount: '', cat: '', date: iso(new Date()), note: '', scope: 'mine', pct: 50 });
  const [form, setForm] = useState<CatForm>({ id: null, name: '', kind: 'variable', ci: 4, target: '' });

  useEffect(() => {
    if (!toast) return;
    const x = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(x);
  }, [toast]);

  if (!data) return <main className='min-h-screen' />;
  const l: Ledger = data;
  if (!l.onboarded) return <Onboarding update={update} />;

  const t = makeT(l.lang);
  const lang: Lang = l.lang;
  const $ = (c: number, dec = true) => money(c, dec, lang);
  const m = monthMeta(ym);
  const mb = monthBudget(l, ym);

  const cats = l.cats.map((c) => {
    const target = mb.targets[c.id] || 0;
    const sp = spentBy(l, ym, c.id);
    const st = catState(c.kind, target, sp, WARN_AT);
    const pct = target > 0 ? Math.round((sp / target) * 100) : 0;
    const meta =
      st === 'over' ? { color: '#d8365b', text: $(sp - target) + ' ' + t('overBy'), bar: '#ec6a86' }
      : st === 'near' ? { color: '#c8722a', text: pct + '% ' + t('used') + ' — ' + t('tight'), bar: '#f4874b' }
      : st === 'funded' ? { color: '#0b7b8f', text: t('funded'), bar: c.c }
      : st === 'empty' ? { color: '#8b969b', text: t('noTarget'), bar: c.c }
      : { color: '#8b969b', text: pct + '% ' + t('used'), bar: c.c };
    return { ...c, target, spent: sp, st, meta, w: target > 0 ? Math.min(100, (sp / target) * 100) : 0 };
  });
  const byId = Object.fromEntries(cats.map((c) => [c.id, c]));
  const spent = totalSpent(l, ym);
  const alloc = allocated(mb, l.cats);
  const remaining = mb.ceiling - spent;
  const varLeft = cats.filter((c) => c.kind === 'variable').reduce((a, c) => a + Math.max(0, c.target - c.spent), 0);
  const monthTx = txOfMonth(l, ym).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));

  let acc = 0;
  const parts: string[] = [];
  cats.filter((c) => c.spent > 0).forEach((c) => {
    const share = Math.min(100 - acc, (c.spent / Math.max(mb.ceiling || spent, spent, 1)) * 100);
    parts.push(c.c + ' ' + acc.toFixed(2) + '% ' + (acc + share).toFixed(2) + '%');
    acc += share;
  });
  parts.push('rgba(255,255,255,.13) ' + acc.toFixed(2) + '% 100%');
  const donut = 'conic-gradient(from -90deg,' + parts.join(',') + ')';

  const over = cats.filter((c) => c.st === 'over');
  const near = cats.filter((c) => c.st === 'near');
  const alert = over.length
    ? { title: over[0].name + ' ' + t('isOver') + ' ' + $(over[0].spent - over[0].target) + ' ' + t('overBy'), body: t('moveHeadroom') }
    : near.length
    ? { title: near[0].name + ' ' + t('runningHot'), body: near[0].meta.text + ' — ' + t('withDaysLeft', { n: m.daysLeft }) }
    : null;

  const go = (s: Screen) => { setScreen(s); setDetail(null); };
  const chip = (on: boolean) => (on ? 'bg-deep text-white' : 'bg-white text-[#5b6a70]');

  const openLog = () => {
    if (!l.cats.length) { go('budget'); setToast(t('noCatsBody')); return; }
    setDraft({ amount: '', cat: l.cats[0].id, date: iso(new Date()), note: '', scope: 'mine', pct: 50 });
    setSheet('log');
  };
  const openCatForm = (c?: Category) => {
    if (c) {
      const ci = PALETTE.findIndex((p) => p.c === c.c);
      setForm({ id: c.id, name: c.name, kind: c.kind, ci: ci < 0 ? 4 : ci, target: fromCents(mb.targets[c.id] || 0) });
    } else setForm({ id: null, name: '', kind: 'variable', ci: 4, target: '' });
    setSheet('cat');
  };

  const saveCat = () => {
    if (!form.name.trim()) return;
    const p = PALETTE[form.ci];
    update((d) => {
      const b = ensureMonth(d, ym);
      if (form.id) {
        const c = d.cats.find((x) => x.id === form.id);
        if (c) { c.name = form.name.trim(); c.kind = form.kind; c.c = p.c; c.cl = p.cl; c.cd = p.cd; }
        b.targets[form.id] = toCents(form.target);
      } else {
        const c = makeCategory(form.name.trim(), form.kind, form.ci, d.cats.length);
        d.cats.push(c);
        b.targets[c.id] = toCents(form.target);
      }
    });
    setToast(form.name.trim() + ' ' + (form.id ? t('updated') : t('added')));
    setSheet(null);
  };

  const deleteCat = () => {
    if (!form.id) return;
    update((d) => {
      d.cats = d.cats.filter((c) => c.id !== form.id);
      Object.values(d.months).forEach((b) => { delete b.targets[form.id as string]; });
    });
    setSheet(null);
    setScreen('budget');
    setDetail(null);
  };

  const pressKey = (k: string) =>
    setDraft((d) => {
      let a = d.amount;
      if (k === 'del') a = a.slice(0, -1);
      else if (k === '.') { if (!a.includes('.')) a = (a === '' ? '0' : a) + '.'; }
      else {
        if (a.includes('.') && a.split('.')[1].length >= 2) return d;
        if (a.replace('.', '').length >= 7) return d;
        a = a === '0' ? k : a + k;
      }
      return { ...d, amount: a };
    });
  const amountValue = parseFloat(draft.amount) || 0;

  const saveTx = () => {
    if (amountValue <= 0) return;
    const cat = l.cats.find((c) => c.id === draft.cat);
    if (!cat) return;
    const cents = Math.round(amountValue * 100);
    update((d) => {
      d.tx.push({
        id: 'u' + Date.now(), cat: draft.cat, amount: cents, date: draft.date,
        note: draft.note || cat.name, scope: draft.scope, pct: draft.scope === 'split' ? draft.pct : 100,
        paidBy: 'me', source: 'manual',
      });
      ensureMonth(d, ymOf(draft.date));
    });
    setYm(ymOf(draft.date));
    setSheet(null);
    setDraft({ amount: '', cat: draft.cat, date: iso(new Date()), note: '', scope: 'mine', pct: 50 });
    setToast(t('logged') + ' ' + $(cents) + ' · ' + cat.name);
  };

  const Row = ({ tx, showTile = true }: { tx: Tx; showTile?: boolean }) => {
    const c = byId[tx.cat];
    return (
      <button onClick={() => { setViewTx(tx.id); setSheet('tx'); }} className='flex w-full items-center gap-3 border-t border-black/[0.05] px-[15px] py-3 text-left first:border-t-0'>
        {showTile && c && <Tile cat={c} size={34} />}
        <div className='min-w-0 flex-1'>
          <div className='truncate text-[13.5px] font-semibold text-ink'>{tx.note || (c ? c.name : '—')}</div>
          <div className='mt-[3px] text-[11.5px] text-[#8b969b]'>
            {(c ? c.name : '—') + ' · ' + dayLabel(tx.date, lang) + (tx.scope === 'split' ? ' · ' + tx.pct + '/' + (100 - tx.pct) : '')}
          </div>
        </div>
        <div className='font-mono text-[13.5px] text-ink'>{$(tx.amount)}</div>
      </button>
    );
  };

  const Empty = ({ title, body }: { title: string; body: string }) => (
    <div className='rounded-[22px] border border-dashed border-black/[0.12] px-6 py-10 text-center'>
      <div className='text-[15px] font-semibold text-ink'>{title}</div>
      <div className='mx-auto mt-2 max-w-[240px] text-[13px] leading-relaxed text-[#8b969b]'>{body}</div>
    </div>
  );

  const detCat = cats.find((c) => c.id === detail);
  const filtered = monthTx.filter((x) => filter === 'all' || x.scope === filter);
  const groupMap: Record<string, Tx[]> = {};
  filtered.forEach((x) => { (groupMap[x.date] = groupMap[x.date] || []).push(x); });
  const groupKeys = Object.keys(groupMap).sort().reverse();

  return (
    <main className='mx-auto flex min-h-screen max-w-[430px] flex-col bg-canvas shadow-[0_0_60px_-20px_rgba(18,48,58,.25)]'>
      <div className='relative flex-1 overflow-hidden'>
        <div className='h-full overflow-y-auto pb-[100px] pt-6'>

          {screen === 'home' && (
            <div className='px-[18px] pb-6'>
              <div className='mb-5 flex items-center justify-between'>
                <div>
                  <div className='text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b969b]'>{l.workspace}</div>
                  <div className='mt-1 text-2xl font-bold tracking-[-0.015em] text-ink'>{t('overview')}</div>
                </div>
                <div className='flex items-center gap-1 rounded-full border border-black/[0.08] bg-white px-1.5 py-1'>
                  <button onClick={() => setYm(shiftYm(ym, -1))} className='grid h-7 w-7 place-items-center text-[#5b6a70]'>‹</button>
                  <span className='px-1 text-[12px] font-semibold text-ink'>{ymLabel(ym, lang)}</span>
                  <button onClick={() => setYm(shiftYm(ym, 1))} className='grid h-7 w-7 place-items-center text-[#5b6a70]'>›</button>
                </div>
              </div>

              {mb.ceiling <= 0 ? (
                <button onClick={() => go('budget')} className='block w-full text-left'>
                  <Empty title={t('noBudget')} body={t('noBudgetBody')} />
                </button>
              ) : (
                <div className='rounded-[26px] bg-deep p-[22px] text-white shadow-[0_18px_34px_-20px_rgba(18,48,58,.7)]'>
                  <div className='flex items-center gap-5'>
                    <div className='grid h-28 w-28 shrink-0 place-items-center rounded-full' style={{ background: donut }}>
                      <div className='grid h-[78px] w-[78px] place-items-center rounded-full bg-deep text-center'>
                        <div>
                          <div className='font-mono text-[21px] tracking-tight'>{Math.round((spent / mb.ceiling) * 100)}%</div>
                          <div className='mt-[5px] text-[8.5px] font-semibold uppercase tracking-[0.1em] text-white/50'>{t('spent')}</div>
                        </div>
                      </div>
                    </div>
                    <div className='flex flex-1 flex-col gap-3'>
                      <div>
                        <div className='text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/50'>{t('remaining')}</div>
                        <div className='mt-1 font-mono text-[27px] tracking-[-0.03em]'>{$(remaining)}</div>
                      </div>
                      <div className='flex gap-4'>
                        <div>
                          <div className='text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/50'>{t('budgetLabel')}</div>
                          <div className='mt-1 font-mono text-sm text-white/90'>{$(mb.ceiling, false)}</div>
                        </div>
                        <div>
                          <div className='text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/50'>{t('spent')}</div>
                          <div className='mt-1 font-mono text-sm text-white/90'>{$(spent)}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  {m.isCurrent && (
                    <div className='mt-[18px] flex items-center justify-between border-t border-white/10 pt-[15px]'>
                      <div className='text-[12.5px] text-white/60'>{t('safeDaily')}</div>
                      <div className='font-mono text-[15px] text-[#7fd9e6]'>{$(Math.round(varLeft / m.daysLeft))}</div>
                    </div>
                  )}
                </div>
              )}

              {alert && (
                <button onClick={() => go('budget')} className='anim-pop mt-3.5 flex w-full items-center gap-3 rounded-[18px] border border-[#ec6a86]/30 bg-white px-4 py-3.5 text-left'>
                  <div className='grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px]' style={{ background: 'linear-gradient(155deg,#ffa9ba,#ec6a86 62%,#bc3f5c)', boxShadow: '0 5px 10px -4px rgba(236,106,134,.6), inset 0 1px 0 rgba(255,255,255,.55)' }}>
                    <div className='h-[13px] w-[2.5px] rounded-sm bg-white/95' />
                  </div>
                  <div className='flex-1'>
                    <div className='text-[13.5px] font-semibold text-ink'>{alert.title}</div>
                    <div className='mt-0.5 text-xs text-[#8b969b]'>{alert.body}</div>
                  </div>
                  <div className='text-xs font-semibold text-[#0b7b8f]'>{t('rebalance')}</div>
                </button>
              )}

              <div className='mb-3 mt-[26px] flex items-baseline justify-between'>
                <div className='text-[13px] font-bold text-ink'>{t('categories')}</div>
                <div className='font-mono text-[11.5px] text-[#8b969b]'>{l.cats.length} {t('active')}</div>
              </div>
              {l.cats.length === 0 ? (
                <button onClick={() => go('budget')} className='block w-full text-left'><Empty title={t('noCats')} body={t('noCatsBody')} /></button>
              ) : (
                <div className='flex flex-col gap-[9px]'>
                  {cats.map((c) => (
                    <button key={c.id} onClick={() => { setDetail(c.id); setScreen('detail'); }} className={CARD + ' flex w-full items-center gap-3 px-4 py-3.5 text-left'}>
                      <Tile cat={c} size={44} />
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-baseline justify-between gap-2.5'>
                          <div className='truncate text-sm font-semibold text-ink'>{c.name}</div>
                          <div className='shrink-0 font-mono text-[12.5px] text-ink'>{$(c.spent)}</div>
                        </div>
                        <div className='my-2 h-1.5 overflow-hidden rounded-full bg-[#eceff0]'>
                          <div className='h-full rounded-full' style={{ width: c.w + '%', background: c.meta.bar }} />
                        </div>
                        <div className='flex items-center justify-between gap-2.5'>
                          <div className='text-[11.5px]' style={{ color: c.meta.color }}>{c.meta.text}</div>
                          <div className='font-mono text-[11.5px] text-[#8b969b]'>{c.target > 0 ? t('of') + ' ' + $(c.target, false) : ''}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div className='mb-2.5 mt-[26px] flex items-baseline justify-between'>
                <div className='text-[13px] font-bold text-ink'>{t('recent')}</div>
                <button onClick={() => go('activity')} className='text-xs font-semibold text-[#0b7b8f]'>{t('allActivity')}</button>
              </div>
              {monthTx.length === 0 ? (
                <Empty title={t('emptyTitle')} body={t('emptyBody')} />
              ) : (
                <div className={CARD + ' overflow-hidden'}>{monthTx.slice(0, 4).map((x) => <Row key={x.id} tx={x} />)}</div>
              )}
            </div>
          )}

          {screen === 'activity' && (
            <div className='px-[18px] pb-6'>
              <div className='mb-1 text-2xl font-bold tracking-[-0.015em] text-ink'>{t('activity')}</div>
              <div className='mb-3.5 text-[13px] text-[#8b969b]'>{ymLabel(ym, lang)}</div>
              <div className='flex gap-[7px]'>
                {([['all', t('allActivity')], ['mine', t('justMe')], ['split', t('split5050')]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setFilter(k as 'all' | 'mine' | 'split')} className={'flex h-8 items-center rounded-full border border-black/[0.09] px-3.5 text-[12.5px] font-semibold ' + chip(filter === k)}>{label}</button>
                ))}
              </div>
              <div className='mb-4 mt-2.5 font-mono text-[11.5px] text-[#8b969b]'>
                {filtered.length} {t('transactions')} · {$(filtered.reduce((a, x) => a + x.amount, 0))}
              </div>
              {filtered.length === 0 ? <Empty title={t('noTx')} body={t('emptyBody')} /> : groupKeys.map((k) => (
                <div key={k} className='mb-[18px]'>
                  <div className='mx-1 mb-2 flex items-baseline justify-between'>
                    <div className='text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#8b969b]'>{dayLabel(k, lang)}</div>
                    <div className='font-mono text-[11.5px] text-[#8b969b]'>{$(groupMap[k].reduce((a, x) => a + x.amount, 0))}</div>
                  </div>
                  <div className={CARD + ' overflow-hidden'}>{groupMap[k].map((x) => <Row key={x.id} tx={x} />)}</div>
                </div>
              ))}
            </div>
          )}

          {screen === 'budget' && (
            <div className='px-[18px] pb-6'>
              <div className='text-2xl font-bold tracking-[-0.015em] text-ink'>{t('budget')}</div>
              <div className='mb-4 mt-1 flex items-center gap-2'>
                <button onClick={() => setYm(shiftYm(ym, -1))} className='grid h-7 w-7 place-items-center rounded-full bg-white text-[#5b6a70] border border-black/[0.08]'>‹</button>
                <span className='text-[13px] font-semibold text-ink'>{ymLabel(ym, lang)}</span>
                <button onClick={() => setYm(shiftYm(ym, 1))} className='grid h-7 w-7 place-items-center rounded-full bg-white text-[#5b6a70] border border-black/[0.08]'>›</button>
                <span className='ml-auto text-[11px] text-[#8b969b]'>{t('perMonth')}</span>
              </div>

              <div className={CARD + ' rounded-[22px] p-[18px]'}>
                <div className={LABEL}>{t('monthlyCeiling')}</div>
                <div className='my-3 flex items-center gap-2 rounded-2xl bg-canvas px-4 py-3'>
                  <span className='font-mono text-[24px] text-[#8b969b]'>€</span>
                  <input
                    value={fromCents(mb.ceiling)}
                    onChange={(e) => { const v = toCents(e.target.value.replace(/[^0-9.,]/g, '')); update((d) => { ensureMonth(d, ym).ceiling = v; }); }}
                    inputMode='decimal'
                    placeholder='0'
                    className='w-full bg-transparent font-mono text-[28px] tracking-[-0.03em] text-ink outline-none'
                  />
                </div>
                {mb.ceiling > 0 && (
                  <>
                    <div className='mb-2 mt-4 h-2 overflow-hidden rounded-full bg-[#eceff0]'>
                      <div className='h-full' style={{ width: Math.min(100, (alloc / mb.ceiling) * 100) + '%', background: alloc > mb.ceiling ? '#d8365b' : alloc < mb.ceiling ? '#c8722a' : '#0b7b8f' }} />
                    </div>
                    <div className='flex justify-between font-mono text-[11.5px]'>
                      <span className='text-[#8b969b]'>{$(alloc, false)} {t('allocated')}</span>
                      <span style={{ color: alloc > mb.ceiling ? '#d8365b' : alloc < mb.ceiling ? '#c8722a' : '#0b7b8f' }}>
                        {alloc === mb.ceiling ? t('fullyAllocated') : alloc > mb.ceiling ? $(alloc - mb.ceiling, false) + ' ' + t('overCeiling') : $(mb.ceiling - alloc, false) + ' ' + t('unallocated')}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <div className='mb-3 mt-6 text-[13px] font-bold text-ink'>{t('categoryTargets')}</div>
              <div className='flex flex-col gap-[9px]'>
                {cats.map((c) => (
                  <div key={c.id} className={CARD + ' px-4 py-3.5'}>
                    <button onClick={() => openCatForm(c)} className='flex w-full items-center gap-3 text-left'>
                      <Tile cat={c} size={34} />
                      <div className='min-w-0 flex-1'>
                        <div className='truncate text-[13.5px] font-semibold text-ink'>{c.name}</div>
                        <div className='mt-[3px] text-[11px] text-[#8b969b]'>{c.kind === 'fixed' ? t('fixed') : t('variable')}{mb.ceiling > 0 && c.target > 0 ? ' · ' + Math.round((c.target / mb.ceiling) * 100) + '%' : ''}</div>
                      </div>
                      <div className='shrink-0 font-mono text-[15px] text-ink'>{$(c.target, false)}</div>
                    </button>
                    <input
                      type='range' min={0} max={Math.max(mb.ceiling || 200000, c.target)} step={500} value={c.target}
                      onChange={(e) => { const v = parseInt(e.target.value, 10); update((d) => { ensureMonth(d, ym).targets[c.id] = v; }); }}
                      className='mt-3 w-full' style={{ accentColor: c.c }}
                    />
                    <div className='mt-0.5 flex justify-between font-mono text-[10.5px] text-[#b3bcbf]'>
                      <span>0</span><span>{t('spent')} {$(c.spent)}</span><span>{$(Math.max(mb.ceiling || 200000, c.target), false)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => openCatForm()} className='mt-3 flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-black/[0.18]'>
                <div className='relative grid h-4 w-4 place-items-center'>
                  <div className='absolute h-0.5 w-3.5 rounded-sm bg-[#5b6a70]' />
                  <div className='absolute h-3.5 w-0.5 rounded-sm bg-[#5b6a70]' />
                </div>
                <span className='text-[13.5px] font-semibold text-[#5b6a70]'>{t('addCategory')}</span>
              </button>
            </div>
          )}

          {screen === 'detail' && detCat && (
            <div className='px-[18px] pb-6'>
              <div className='mb-5 flex items-center justify-between'>
                <button onClick={() => go('home')} className='flex h-[34px] items-center gap-2 rounded-full border border-black/[0.08] bg-white pl-[11px] pr-3.5'>
                  <div className='h-[7px] w-[7px] rotate-45 border-b-2 border-l-2 border-[#5b6a70]' />
                  <span className='text-[12.5px] font-semibold text-[#5b6a70]'>{t('overview')}</span>
                </button>
                <button onClick={() => openCatForm(detCat)} className='flex h-[34px] items-center rounded-full border border-black/[0.08] bg-white px-3.5 text-[12.5px] font-semibold text-[#0b7b8f]'>{t('editCategory')}</button>
              </div>
              <div className='mb-[22px] flex items-center gap-[15px]'>
                <Tile cat={detCat} size={54} />
                <div>
                  <div className='text-[21px] font-bold tracking-[-0.01em] text-ink'>{detCat.name}</div>
                  <div className='mt-[5px] text-[12.5px] text-[#8b969b]'>{detCat.kind === 'fixed' ? t('fixed') : t('variable')} · {monthTx.filter((x) => x.cat === detCat.id).length} {t('transactions')}</div>
                </div>
              </div>
              <div className={CARD + ' rounded-[22px] p-[18px]'}>
                <div className='flex items-end justify-between'>
                  <div>
                    <div className={LABEL}>{t('spent')}</div>
                    <div className='mt-1.5 font-mono text-[28px] tracking-[-0.03em] text-ink'>{$(detCat.spent)}</div>
                  </div>
                  <div className='text-right'>
                    <div className={LABEL}>{t('left')}</div>
                    <div className='mt-1.5 font-mono text-[17px]' style={{ color: detCat.meta.color }}>{$(detCat.target - detCat.spent)}</div>
                  </div>
                </div>
                <div className='relative my-4 h-2.5 overflow-hidden rounded-full bg-[#eceff0]'>
                  <div className='h-full rounded-full' style={{ width: detCat.w + '%', background: detCat.meta.bar }} />
                </div>
                <div className='text-xs leading-relaxed text-[#5b6a70]'>{detCat.meta.text}</div>
              </div>
              <button onClick={() => go('budget')} className='my-3 flex h-[46px] w-full items-center justify-center rounded-2xl bg-deep text-[13.5px] font-semibold text-white'>{t('adjustTarget')}</button>
              <div className='mb-2.5 mt-6 text-[13px] font-bold text-ink'>{t('transactions')}</div>
              <div className={CARD + ' overflow-hidden'}>{monthTx.filter((x) => x.cat === detCat.id).map((x) => <Row key={x.id} tx={x} showTile={false} />)}</div>
            </div>
          )}

          {screen === 'me' && (
            <div className='px-[18px] pb-6'>
              <div className='mb-[18px] text-2xl font-bold tracking-[-0.015em] text-ink'>{t('account')}</div>
              <div className={CARD + ' rounded-[22px] p-[18px]'}>
                <div className={LABEL}>{t('workspace')}</div>
                <input value={l.workspace} onChange={(e) => { const v = e.target.value; update((d) => { d.workspace = v; }); }} className='mt-2.5 h-[46px] w-full rounded-2xl bg-canvas px-3.5 text-[15px] font-semibold text-ink outline-none' />
                <div className={LABEL + ' mt-5'}>{t('language')}</div>
                <div className='mt-2.5 flex gap-2.5'>
                  {(['en', 'pt'] as Lang[]).map((k) => (
                    <button key={k} onClick={() => update((d) => { d.lang = k; })} className={'h-[46px] flex-1 rounded-2xl text-[14px] font-semibold ' + (lang === k ? 'bg-deep text-white' : 'bg-canvas text-[#5b6a70]')}>{k === 'en' ? 'English' : 'Português'}</button>
                  ))}
                </div>
              </div>

              <div className='mt-2.5 rounded-[22px] bg-deep p-[18px] text-white'>
                <div className='flex items-end justify-between'>
                  <div>
                    <div className='text-[9.5px] font-semibold uppercase tracking-[0.11em] text-white/50'>{t('unsettledTitle')}</div>
                    <div className='mt-[7px] font-mono text-[26px] tracking-[-0.03em]'>{$(unsettled(l, ym))}</div>
                  </div>
                  <div className='max-w-[140px] text-right text-[11.5px] text-white/55'>{t('unsettledBody')}</div>
                </div>
              </div>

              <div className={LABEL + ' mb-2.5 mt-6'}>{t('comingNext')}</div>
              <div className='flex flex-col gap-[9px]'>
                {[
                  { t: t('sharedHousehold'), s: t('sharedBody'), p: 'PHASE 2', g: 'linear-gradient(155deg,#d3b6f7,#a878e2 62%,#7a4bb5)' },
                  { t: t('bankSync'), s: t('bankBody'), p: 'PHASE 3', g: 'linear-gradient(155deg,#a3b0ff,#6c7ff2 62%,#4757c9)' },
                ].map((x) => (
                  <div key={x.p} className={CARD + ' flex items-center gap-3 p-4 opacity-70'}>
                    <div className='grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px]' style={{ background: x.g, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.5)' }}>
                      <div className='h-2.5 w-2.5 rounded-full bg-white/90' />
                    </div>
                    <div className='flex-1'>
                      <div className='text-sm font-semibold text-ink'>{x.t}</div>
                      <div className='mt-[3px] text-xs text-[#8b969b]'>{x.s}</div>
                    </div>
                    <div className='flex h-6 items-center rounded-lg bg-canvas px-2.5 font-mono text-[10px] font-semibold text-[#8b969b]'>{x.p}</div>
                  </div>
                ))}
              </div>

              <button onClick={() => { if (confirm(t('resetBody'))) { reset(); } }} className={CARD + ' mt-6 flex w-full items-center justify-between p-4 text-left'}>
                <div>
                  <div className='text-sm font-semibold text-ink'>{t('resetData')}</div>
                  <div className='mt-[3px] text-xs text-[#8b969b]'>{t('resetBody')}</div>
                </div>
                <div className='text-[12.5px] font-semibold text-[#ec6a86]'>{t('erase')}</div>
              </button>
            </div>
          )}
        </div>

        {toast && (
          <div className='anim-toast absolute bottom-[100px] left-4 right-4 flex items-center gap-3 rounded-2xl bg-deep px-4 py-3.5 shadow-[0_14px_28px_-14px_rgba(18,48,58,.8)]'>
            <div className='grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#7fd9e6]'>
              <div className='-mt-0.5 h-1 w-2 -rotate-45 border-b-2 border-l-2 border-deep' />
            </div>
            <div className='flex-1 text-[13px] font-medium text-white'>{toast}</div>
          </div>
        )}

        {sheet === 'log' && (
          <>
            <div className='anim-fade absolute inset-0 bg-[rgba(11,20,24,.42)]' onClick={() => setSheet(null)} />
            <div className='anim-sheet absolute inset-x-0 bottom-0 max-h-[96%] overflow-y-auto rounded-t-[30px] bg-canvas px-[18px] pb-6 pt-2.5'>
              <div className='mx-auto mb-3 mt-0.5 h-1 w-[38px] rounded-full bg-black/15' />
              <div className='flex items-center justify-between'>
                <div className='text-[17px] font-bold text-ink'>{t('newExpense')}</div>
                <button onClick={() => setSheet(null)} className='grid h-[30px] w-[30px] place-items-center rounded-full bg-black/[0.06] text-[#5b6a70]'>✕</button>
              </div>
              <div className='pb-2 pt-3.5 text-center'>
                <div className='font-mono text-[46px] tracking-[-0.04em]' style={{ color: draft.amount === '' ? '#c3cbce' : '#16242a' }}>€{draft.amount === '' ? '0' : draft.amount}</div>
                <div className='mt-2 text-[11.5px] text-[#8b969b]'>{(byId[draft.cat] ? byId[draft.cat].name : '') + ' · ' + dayLabel(draft.date, lang)}</div>
              </div>
              <div className='-mx-[18px] flex gap-2.5 overflow-x-auto px-[18px] pb-3.5 pt-3'>
                {cats.map((c) => (
                  <button key={c.id} onClick={() => setDraft((d) => ({ ...d, cat: c.id }))} className='flex w-16 shrink-0 flex-col items-center gap-[7px]' style={{ opacity: draft.cat === c.id ? 1 : 0.42 }}>
                    <Tile cat={c} size={52} />
                    <div className='w-full truncate text-center text-[9.5px] font-semibold leading-tight text-[#5b6a70]'>{c.name}</div>
                  </button>
                ))}
              </div>
              <div className='mb-2.5 flex gap-2'>
                {[0, 1].map((off) => {
                  const dd = new Date(); dd.setDate(dd.getDate() - off);
                  const v = iso(dd);
                  return <button key={off} onClick={() => setDraft((x) => ({ ...x, date: v }))} className={'flex h-9 items-center rounded-xl px-3.5 text-[12.5px] font-semibold ' + chip(draft.date === v)}>{off === 0 ? t('today') : t('yesterday')}</button>;
                })}
                <input type='date' value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className='h-9 flex-1 rounded-xl bg-white px-2.5 font-mono text-[12.5px] text-ink' />
              </div>
              <div className='mb-2.5 flex gap-2'>
                {([['mine', t('justMe')], ['half', t('split5050')], ['custom', t('customPct')]] as const).map(([k, label]) => {
                  const on = k === 'mine' ? draft.scope === 'mine' : k === 'half' ? draft.scope === 'split' && draft.pct === 50 : draft.scope === 'split' && draft.pct !== 50;
                  return <button key={k} onClick={() => setDraft((d) => (k === 'mine' ? { ...d, scope: 'mine' } : { ...d, scope: 'split', pct: k === 'half' ? 50 : d.pct === 50 ? 60 : d.pct }))} className={'h-9 flex-1 rounded-xl text-[12.5px] font-semibold ' + chip(on)}>{label}</button>;
                })}
              </div>
              {draft.scope === 'split' && (
                <div className='mb-2.5 flex items-center gap-3 rounded-2xl bg-white p-3'>
                  <button onClick={() => setDraft((d) => ({ ...d, pct: Math.max(0, d.pct - 5) }))} className='grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-canvas'>
                    <div className='h-[2.5px] w-2.5 rounded-sm bg-ink' />
                  </button>
                  <div className='flex-1 text-center'>
                    <div className='font-mono text-[13px] text-ink'>{t('you')} {draft.pct}% · {t('partner')} {100 - draft.pct}%</div>
                    <div className='mt-1.5 text-[10.5px] text-[#8b969b]'>{$(Math.round((amountValue * 100 * draft.pct) / 100))} {t('countsAgainst')}</div>
                  </div>
                  <button onClick={() => setDraft((d) => ({ ...d, pct: Math.min(100, d.pct + 5) }))} className='relative grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-canvas'>
                    <div className='absolute h-[2.5px] w-2.5 rounded-sm bg-ink' />
                    <div className='absolute h-2.5 w-[2.5px] rounded-sm bg-ink' />
                  </button>
                </div>
              )}
              <input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder={t('note')} className='mb-3.5 h-10 w-full rounded-xl bg-white px-3.5 text-[13.5px] text-ink outline-none' />
              <div className='grid grid-cols-3 gap-2'>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
                  <button key={k} onClick={() => pressKey(k)} className='grid h-[50px] select-none place-items-center rounded-[15px] bg-white font-mono text-[21px] text-ink shadow-[0_1px_2px_rgba(22,36,42,.06)] active:bg-[#e9eef0]'>{k === 'del' ? '⌫' : k}</button>
                ))}
              </div>
              <button onClick={saveTx} disabled={amountValue <= 0} className='mt-3 h-[54px] w-full rounded-[18px] text-[15px] font-bold text-white' style={{ background: amountValue > 0 ? '#12303a' : 'rgba(22,36,42,.22)' }}>
                {amountValue > 0 ? t('save') + ' ' + $(Math.round(amountValue * 100)) : t('enterAmount')}
              </button>
            </div>
          </>
        )}

        {sheet === 'tx' && (() => {
          const x = l.tx.find((r) => r.id === viewTx);
          if (!x) return null;
          const c = byId[x.cat];
          return (
            <>
              <div className='anim-fade absolute inset-0 bg-[rgba(11,20,24,.42)]' onClick={() => setSheet(null)} />
              <div className='anim-sheet absolute inset-x-0 bottom-0 rounded-t-[30px] bg-canvas px-[18px] pb-6 pt-2.5'>
                <div className='mx-auto mb-[18px] mt-0.5 h-1 w-[38px] rounded-full bg-black/15' />
                <div className='mb-5 flex items-center gap-3.5'>
                  {c && <Tile cat={c} size={46} />}
                  <div className='flex-1'>
                    <div className='text-[17px] font-bold text-ink'>{x.note}</div>
                    <div className='mt-1 text-[12.5px] text-[#8b969b]'>{(c ? c.name : '') + ' · ' + dayLabel(x.date, lang) + ' · ' + (x.scope === 'split' ? x.pct + '/' + (100 - x.pct) : t('justMe'))}</div>
                  </div>
                  <div className='font-mono text-2xl tracking-[-0.02em] text-ink'>{$(x.amount)}</div>
                </div>
                <div className='flex gap-2.5'>
                  <button onClick={() => setSheet(null)} className='h-[50px] flex-1 rounded-[17px] bg-white text-sm font-semibold text-ink'>{t('close')}</button>
                  <button onClick={() => { update((d) => { d.tx = d.tx.filter((r) => r.id !== x.id); }); setSheet(null); setToast(t('deleted')); }} className='h-[50px] flex-1 rounded-[17px] bg-[#ec6a86] text-sm font-semibold text-white'>{t('deleteTx')}</button>
                </div>
              </div>
            </>
          );
        })()}

        {sheet === 'cat' && (
          <>
            <div className='anim-fade absolute inset-0 bg-[rgba(11,20,24,.42)]' onClick={() => setSheet(null)} />
            <div className='anim-sheet absolute inset-x-0 bottom-0 rounded-t-[30px] bg-canvas px-[18px] pb-6 pt-2.5'>
              <div className='mx-auto mb-3.5 mt-0.5 h-1 w-[38px] rounded-full bg-black/15' />
              <div className='mb-4 text-[17px] font-bold text-ink'>{form.id ? t('editCategory') : t('newCategory')}</div>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('name')} className='mb-2.5 h-[46px] w-full rounded-2xl bg-white px-3.5 text-[14.5px] font-medium text-ink outline-none' />
              <div className='mb-3 flex gap-2.5'>
                <div className='flex h-[46px] flex-1 items-center gap-1 rounded-2xl bg-white px-3.5'>
                  <span className='font-mono text-[14px] text-[#8b969b]'>€</span>
                  <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value.replace(/[^0-9.,]/g, '') })} inputMode='decimal' placeholder={t('target')} className='w-full bg-transparent font-mono text-[14.5px] text-ink outline-none' />
                </div>
                {([['variable', t('variable')], ['fixed', t('fixed')]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setForm({ ...form, kind: k as Kind })} className={'h-[46px] flex-1 rounded-2xl text-[13px] font-semibold ' + chip(form.kind === k)}>{label}</button>
                ))}
              </div>
              <div className='mb-[18px] flex gap-2.5'>
                {PALETTE.map((p, i) => (
                  <button key={i} onClick={() => setForm({ ...form, ci: i })} className='h-10 flex-1 rounded-[13px]' style={{ background: 'linear-gradient(155deg,' + p.cl + ',' + p.c + ' 60%,' + p.cd + ')', boxShadow: form.ci === i ? '0 0 0 3px #12303a' : 'inset 0 1px 0 rgba(255,255,255,.5)' }} />
                ))}
              </div>
              <button onClick={saveCat} className='h-[54px] w-full rounded-[18px] text-[15px] font-bold text-white' style={{ background: form.name.trim() ? '#12303a' : 'rgba(22,36,42,.22)' }}>
                {form.id ? t('saveChanges') : t('create')}
              </button>
              {form.id && (
                <button onClick={() => { if (confirm(t('deleteCatWarn'))) deleteCat(); }} className='mt-2.5 h-[46px] w-full rounded-[16px] text-[13.5px] font-semibold text-[#d8365b]'>{t('deleteCategory')}</button>
              )}
            </div>
          </>
        )}

        <nav className='absolute inset-x-0 bottom-0 flex h-[82px] items-start border-t border-black/[0.07] bg-white/95 px-2 pt-2.5 backdrop-blur-xl'>
          {([['home', t('overview')], ['activity', t('activity')], ['spacer', ''], ['budget', t('budget')], ['me', t('account')]] as const).map(([k, label]) =>
            k === 'spacer' ? (
              <div key='spacer' className='flex-1' />
            ) : (
              <button key={k} onClick={() => go(k as Screen)} className='flex flex-1 flex-col items-center gap-1.5 pt-1.5'>
                <TabIcon kind={k === 'me' ? 'me' : (k as 'home' | 'activity' | 'budget')} on={screen === k || (k === 'home' && screen === 'detail')} />
                <div className='text-[9.5px] font-semibold' style={{ color: screen === k || (k === 'home' && screen === 'detail') ? '#12303a' : '#a8b2b6' }}>{label}</div>
              </button>
            )
          )}
          <button onClick={openLog} aria-label={t('newExpense')} className='absolute left-1/2 top-[-16px] grid h-[58px] w-[58px] -translate-x-1/2 place-items-center rounded-[22px]' style={{ background: 'linear-gradient(155deg,#7fd9e6,#17a8c0 58%,#0b7b8f)', boxShadow: '0 12px 22px -8px rgba(11,123,143,.75), inset 0 1px 0 rgba(255,255,255,.5)' }}>
            <div className='relative grid h-[22px] w-[22px] place-items-center'>
              <div className='absolute h-[3px] w-5 rounded-sm bg-white' />
              <div className='absolute h-5 w-[3px] rounded-sm bg-white' />
            </div>
          </button>
        </nav>
      </div>
    </main>
  );
}

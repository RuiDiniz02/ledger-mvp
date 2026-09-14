'use client';

import { useEffect, useRef, useState } from 'react';
import { PALETTE, STARTERS, dailyBudget, emptyLedger, makeCategory, ymNow } from '@/lib/data';
import { makeT } from '@/lib/i18n';
import { money, parseMoney } from '@/lib/format';
import type { Lang, Ledger } from '@/lib/types';
import { Tile } from './Icons';

export default function Onboarding({ update }: { update: (fn: (d: Ledger) => void) => void }) {
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<Lang>('en');
  const [name, setName] = useState('');
  const [ceiling, setCeiling] = useState('');
  const [picked, setPicked] = useState<string[]>(['bills', 'grocery', 'dining']);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { setLang(navigator.language.toLowerCase().startsWith('pt') ? 'pt' : 'en'); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { title.current?.focus(); window.scrollTo(0, 0); }, [step]);
  const t = makeT(lang);
  const ceilingCents = parseMoney(ceiling) ?? 0;
  const chosen = STARTERS.filter(s => picked.includes(s.key));
  const assigned = chosen.reduce((sum, s) => sum + (parseMoney(targets[s.key] || '0') ?? 0), 0);
  const invalid = chosen.some(s => parseMoney(targets[s.key] || '0') === null);
  const ready = ceilingCents > 0 && assigned > 0 && assigned <= ceilingCents && !invalid;
  const preview: Ledger = { ...emptyLedger(), cats: chosen.map(s => ({ ...makeCategory(s[lang], s.kind, s.ci, 0, s.mark), id: s.key })), months: { [ymNow()]: { ceiling: ceilingCents, targets: Object.fromEntries(chosen.map(s => [s.key, parseMoney(targets[s.key] || '0') ?? 0])) } } };
  const daily = dailyBudget(preview, ymNow());
  const canNext = step === 0 || (step === 1 ? ceilingCents > 0 : step === 2 ? chosen.length > 0 : ready);
  const titles = [t('setupWelcome'), t('setupCeiling'), t('setupCats'), t('setupTargets'), t('setupReview')];
  const descriptions = [t('setupIntro'), t('setupCeilingHelp'), t('setupCatsHelp'), t('setupTargetsHelp'), t('setupReviewHelp')];
  const field = 'h-[52px] w-full rounded-2xl border border-black/10 bg-white px-4 text-base text-ink';
  const finish = () => {
    if (!ready) return;
    const cats = chosen.map((s, i) => makeCategory(s[lang], s.kind, s.ci, i, s.mark));
    update(d => {
      d.lang = lang;
      d.workspace = name.trim() || (lang === 'pt' ? 'O meu dinheiro' : 'My money');
      d.cats = cats;
      d.months[ymNow()] = { ceiling: ceilingCents, targets: Object.fromEntries(cats.map((c, i) => [c.id, parseMoney(targets[chosen[i].key] || '0') ?? 0])) };
      d.onboarded = true;
    });
  };

  return (
    <main className='mx-auto flex min-h-[100dvh] max-w-[480px] flex-col bg-canvas px-6 pb-8 pt-8'>
      <div className='mb-7 flex items-center justify-between text-xs font-semibold text-[#5b6a70]'><span className='text-base font-bold text-deep'>Ledger</span><span>{t('setupStep', { step: step + 1 })}</span></div>
      <div className='mb-7 flex gap-1.5' aria-hidden='true'>{titles.map((_, i) => <div key={i} className={'h-1 flex-1 rounded-full ' + (i <= step ? 'bg-deep' : 'bg-black/10')} />)}</div>
      <h1 ref={title} tabIndex={-1} className='text-[30px] font-bold leading-tight tracking-tight text-ink outline-none'>{titles[step]}</h1>
      <p className='mb-7 mt-3 text-[15px] leading-relaxed text-[#5b6a70]'>{descriptions[step]}</p>
      <div className='flex-1'>
        {step === 0 && <>
          <div className='mb-3 text-sm font-semibold'>{t('setupLang')}</div>
          <div className='mb-7 flex gap-3'>{(['pt', 'en'] as Lang[]).map(k => <button key={k} aria-pressed={lang === k} onClick={() => setLang(k)} className={'h-[52px] flex-1 rounded-2xl border text-base font-semibold ' + (lang === k ? 'border-deep bg-deep text-white' : 'border-black/10 bg-white')}>{k === 'pt' ? 'Português' : 'English'}</button>)}</div>
          <label htmlFor='workspace-name' className='mb-3 block text-sm font-semibold'>{t('setupName')}</label>
          <input id='workspace-name' value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder={t('setupNamePh')} className={field} />
          <p className='mt-7 rounded-2xl bg-white p-4 text-sm leading-relaxed text-[#5b6a70]'>{t('setupPrivacy')}</p>
        </>}
        {step === 1 && <>
          <label htmlFor='starting-budget' className='mb-3 block text-sm font-semibold'>{t('budgetLabel')} · {ymNow()}</label>
          <div className='flex items-center gap-3 rounded-3xl border border-black/10 bg-white p-6'><span className='text-3xl text-[#5b6a70]'>€</span><input id='starting-budget' value={ceiling} onChange={e => setCeiling(e.target.value)} inputMode='decimal' placeholder='0,00' aria-invalid={!!ceiling && parseMoney(ceiling) === null} className='min-w-0 w-full bg-transparent font-mono text-4xl' /></div>
          {ceiling && parseMoney(ceiling) === null && <p role='alert' className='mt-3 text-sm text-[#9b2440]'>{t('invalidAmount')}</p>}
          <p className='mt-5 rounded-2xl bg-[#e3eef0] p-4 text-sm leading-relaxed text-deep'>{t('setupMonthNote')}</p>
        </>}
        {step === 2 && <div className='space-y-6'>{(['fixed', 'variable', 'saving'] as const).map(kind => <section key={kind}>
          <h2 className='mb-3 text-sm font-semibold text-[#5b6a70]'>{t(kind === 'fixed' ? 'setupKindFixed' : kind === 'saving' ? 'setupKindSaving' : 'setupKindVariable')}</h2>
          <div className='grid grid-cols-2 gap-3'>{STARTERS.filter(s => s.kind === kind).map(s => { const on = picked.includes(s.key); return <button key={s.key} aria-pressed={on} onClick={() => setPicked(v => on ? v.filter(x => x !== s.key) : [...v, s.key])} className={'relative flex min-h-[90px] items-center gap-2 rounded-2xl border p-3 text-left ' + (on ? 'border-deep bg-white ring-1 ring-deep' : 'border-black/10 bg-white/50')}><Tile cat={{ id: s.key, name: s[lang], kind, mark: s.mark, ...PALETTE[s.ci] }} size={30} /><span className='text-sm font-semibold'>{s[lang]}</span>{on && <span aria-hidden='true' className='absolute right-2 top-1 text-xs text-deep'>✓</span>}</button>; })}</div>
        </section>)}</div>}
        {step === 3 && <>
          <div className='space-y-3'>{chosen.map(s => <div key={s.key} className='flex items-center gap-3 rounded-2xl border border-black/10 bg-white p-4'><Tile cat={{ id: s.key, name: s[lang], kind: s.kind, mark: s.mark, ...PALETTE[s.ci] }} size={32} /><label htmlFor={'target-' + s.key} className='flex-1 text-sm font-semibold'>{s[lang]}</label><span aria-hidden='true' className='text-[#5b6a70]'>€</span><input id={'target-' + s.key} value={targets[s.key] || ''} onChange={e => setTargets(v => ({ ...v, [s.key]: e.target.value }))} inputMode='decimal' placeholder='0' aria-invalid={parseMoney(targets[s.key] || '0') === null} className='w-24 rounded-lg bg-canvas p-2 text-right font-mono text-base' /></div>)}</div>
          <div aria-live='polite' className='mt-5 rounded-2xl bg-white p-4 text-sm'><div className='flex justify-between font-semibold'><span>{t('allocated')}</span><span>{money(assigned, true, lang)} / {money(ceilingCents, true, lang)}</span></div><div className='my-3 h-2 overflow-hidden rounded-full bg-black/5'><div className={'h-full rounded-full ' + (assigned > ceilingCents ? 'bg-[#d8365b]' : 'bg-accent')} style={{ width: Math.min(100, assigned / Math.max(1, ceilingCents) * 100) + '%' }} /></div><p className={assigned > ceilingCents || invalid ? 'text-[#9b2440]' : 'text-[#5b6a70]'}>{invalid ? t('invalidAmount') : assigned > ceilingCents ? t('setupTooMuch', { amount: money(assigned - ceilingCents, true, lang) }) : assigned === 0 ? t('setupNeedTargets') : assigned < ceilingCents ? t('setupUnassigned', { amount: money(ceilingCents - assigned, true, lang) }) : t('fullyAllocated')}</p></div>
        </>}
        {step === 4 && <>
          <div className='rounded-3xl bg-deep p-6 text-white'><p className='text-sm text-white/80'>{t('safeDaily')}</p><p className='my-3 font-mono text-4xl'>{money(daily.daily ?? 0, true, lang)}</p><p className='text-sm leading-relaxed text-white/80'>{t('dailyFormula', { amount: money(daily.spendable, true, lang), days: daily.days })}</p></div>
          <dl className='mt-5 space-y-4 rounded-2xl bg-white p-5'>{[[t('budgetLabel'), ceilingCents], [t('reservedBills'), daily.reserved], [t('savedLabel'), chosen.filter(s => s.kind === 'saving').reduce((sum, s) => sum + (parseMoney(targets[s.key] || '0') ?? 0), 0)], [t('dailyAvailable'), daily.spendable]].map(([label, value]) => <div key={String(label)} className='flex justify-between gap-3 text-sm'><dt>{label}</dt><dd className='shrink-0 font-mono font-medium'>{money(Number(value), true, lang)}</dd></div>)}</dl>
          <p className='mt-4 text-sm leading-relaxed text-[#5b6a70]'>{t('estimateNotice')}</p>
        </>}
      </div>
      <div className='mt-8 flex gap-3'>{step > 0 && <button onClick={() => setStep(step - 1)} className='min-h-[54px] flex-1 rounded-2xl border border-black/10 bg-white text-base font-semibold'>{t('back')}</button>}<button onClick={() => step === 4 ? finish() : setStep(step + 1)} disabled={!canNext} className='min-h-[54px] flex-[2] rounded-2xl bg-deep text-base font-bold text-white disabled:opacity-40'>{step === 4 ? t('setupReady') : t('next')}</button></div>
    </main>
  );
}

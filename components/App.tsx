'use client';

import { useEffect, useMemo, useState } from 'react';
import { Tile, TabIcon } from './Icons';
import { useLedger } from '@/lib/store';
import { money, dayLabel } from '@/lib/format';
import { PALETTE, MARKS, allocated, catState, iso, monthMeta, spentBy, totalSpent, unsettled } from '@/lib/data';
import type { Category, Kind, Ledger, Tx } from '@/lib/types';

const WARN_AT = 80;
const CARD = 'rounded-[20px] border border-black/[0.06] bg-white';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b969b]';

type Screen = 'home' | 'activity' | 'budget' | 'me' | 'detail';
type Draft = { amount: string; cat: string; date: string; note: string; scope: 'mine' | 'split'; pct: number };

const blankDraft = (catId: string): Draft => ({ amount: '', cat: catId, date: iso(new Date()), note: '', scope: 'mine', pct: 50 });

function stateMeta(st: string, cat: Category, spent: number) {
  const pct = cat.budget > 0 ? Math.round((spent / cat.budget) * 100) : 0;
  if (st === 'over') return { color: '#d8365b', text: money(spent - cat.budget) + ' over budget', bar: '#ec6a86' };
  if (st === 'near') return { color: '#c8722a', text: pct + '% used — tight', bar: '#f4874b' };
  if (st === 'funded') return { color: '#0b7b8f', text: 'Funded for the month', bar: cat.c };
  return { color: '#8b969b', text: pct + '% used', bar: cat.c };
}

export default function App() {
  const { data, update, reset } = useLedger();
  const [screen, setScreen] = useState<Screen>('home');
  const [detail, setDetail] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | 'log' | 'tx' | 'newcat'>(null);
  const [viewTx, setViewTx] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine' | 'split'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => blankDraft('dining'));
  const [nc, setNc] = useState<{ name: string; budget: string; kind: Kind; ci: number }>({ name: '', budget: '', kind: 'variable', ci: 4 });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  const m = useMemo(() => monthMeta(), []);

  if (!data) return <main className='min-h-screen' />;
  const l: Ledger = data;

  const cats = l.cats.map((c) => {
    const spent = spentBy(l, c.id);
    const st = catState(c, spent, WARN_AT);
    return { ...c, spent, st, meta: stateMeta(st, c, spent), w: Math.min(100, c.budget > 0 ? (spent / c.budget) * 100 : 0) };
  });
  const byId = Object.fromEntries(cats.map((c) => [c.id, c]));
  const spent = totalSpent(l);
  const alloc = allocated(l);
  const remaining = l.ceiling - spent;
  const varLeft = cats.filter((c) => c.kind === 'variable').reduce((a, c) => a + Math.max(0, c.budget - c.spent), 0);
  const txSorted = [...l.tx].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));

  let acc = 0;
  const parts: string[] = [];
  cats.filter((c) => c.spent > 0).forEach((c) => {
    const share = Math.min(100 - acc, (c.spent / Math.max(l.ceiling, spent)) * 100);
    parts.push(c.c + ' ' + acc.toFixed(2) + '% ' + (acc + share).toFixed(2) + '%');
    acc += share;
  });
  parts.push('rgba(255,255,255,.13) ' + acc.toFixed(2) + '% 100%');
  const donut = 'conic-gradient(from -90deg,' + parts.join(',') + ')';

  const over = cats.filter((c) => c.st === 'over');
  const near = cats.filter((c) => c.st === 'near');
  const alert = over.length
    ? { title: over[0].name + ' is ' + money(over[0].spent - over[0].budget) + ' over', body: over.length > 1 ? over.length - 1 + ' other category over target' : 'Move headroom from a funded category' }
    : near.length
    ? { title: near[0].name + ' is running hot', body: near[0].meta.text + ' with ' + m.daysLeft + ' days left' }
    : null;

  const openTx = (id: string) => { setViewTx(id); setSheet('tx'); };
  const go = (s: Screen) => { setScreen(s); setDetail(null); };

  const Row = ({ t, showTile = true }: { t: Tx; showTile?: boolean }) => {
    const c = byId[t.cat] ?? cats[0];
    return (
      <button onClick={() => openTx(t.id)} className='flex w-full items-center gap-3 border-t border-black/[0.05] px-[15px] py-3 text-left first:border-t-0'>
        {showTile && <Tile cat={c} size={34} />}
        <div className='min-w-0 flex-1'>
          <div className='truncate text-[13.5px] font-semibold text-ink'>{t.note || c.name}</div>
          <div className='mt-[3px] text-[11.5px] text-[#8b969b]'>
            {c.name} · {dayLabel(t.date)}
            {t.scope === 'split' ? ' · Split ' + t.pct + '/' + (100 - t.pct) : ''}
          </div>
        </div>
        <div className='font-mono text-[13.5px] text-ink'>{money(t.amount)}</div>
      </button>
    );
  };

  const detCat = cats.find((c) => c.id === detail) ?? cats[0];
  const groups = (() => {
    const f = txSorted.filter((t) => filter === 'all' || t.scope === filter);
    const map: Record<string, Tx[]> = {};
    f.forEach((t) => { (map[t.date] = map[t.date] || []).push(t); });
    return { list: Object.keys(map).sort().reverse().map((k) => ({ key: k, items: map[k] })), count: f.length, sum: f.reduce((a, t) => a + t.amount, 0) };
  })();

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

  const save = () => {
    if (amountValue <= 0) return;
    const cat = l.cats.find((c) => c.id === draft.cat)!;
    const cents = Math.round(amountValue * 100);
    update((d) => {
      d.tx.push({
        id: 'u' + Date.now(),
        cat: draft.cat,
        amount: cents,
        date: draft.date,
        note: draft.note || cat.name,
        scope: draft.scope,
        pct: draft.scope === 'split' ? draft.pct : 100,
        paidBy: 'me',
        source: 'manual',
      });
    });
    setSheet(null);
    setDraft(blankDraft(draft.cat));
    setToast('Logged ' + money(cents) + ' · ' + cat.name);
  };

  const chip = (on: boolean) => (on ? 'bg-deep text-white' : 'bg-white text-[#5b6a70]');

  return (
    <main className='mx-auto flex min-h-screen max-w-[430px] flex-col bg-canvas shadow-[0_0_60px_-20px_rgba(18,48,58,.25)]'>
      <div className='relative flex-1 overflow-hidden'>
        <div className='h-full overflow-y-auto pb-[100px] pt-6'>

          {screen === 'home' && (
            <div className='px-[18px] pb-6'>
              <div className='mb-5 flex items-center justify-between'>
                <div>
                  <div className='font-mono text-[10px] uppercase tracking-[0.14em] text-[#8b969b]'>{m.label}</div>
                  <div className='mt-1 text-2xl font-bold tracking-[-0.015em] text-ink'>Overview</div>
                </div>
                <div className='flex h-[34px] items-center rounded-full border border-black/[0.08] bg-white px-3 font-mono text-xs text-[#5b6a70]'>Day {m.day} / {m.days}</div>
              </div>

              <div className='rounded-[26px] bg-deep p-[22px] text-white shadow-[0_18px_34px_-20px_rgba(18,48,58,.7)]'>
                <div className='flex items-center gap-5'>
                  <div className='grid h-28 w-28 shrink-0 place-items-center rounded-full' style={{ background: donut }}>
                    <div className='grid h-[78px] w-[78px] place-items-center rounded-full bg-deep text-center'>
                      <div>
                        <div className='font-mono text-[21px] tracking-tight'>{Math.round((spent / l.ceiling) * 100)}%</div>
                        <div className='mt-[5px] text-[8.5px] font-semibold uppercase tracking-[0.1em] text-white/50'>spent</div>
                      </div>
                    </div>
                  </div>
                  <div className='flex flex-1 flex-col gap-3'>
                    <div>
                      <div className='text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/50'>Remaining</div>
                      <div className='mt-1 font-mono text-[27px] tracking-[-0.03em]'>{money(remaining)}</div>
                    </div>
                    <div className='flex gap-4'>
                      <div>
                        <div className='text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/50'>Budget</div>
                        <div className='mt-1 font-mono text-sm text-white/90'>{money(l.ceiling, false)}</div>
                      </div>
                      <div>
                        <div className='text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/50'>Spent</div>
                        <div className='mt-1 font-mono text-sm text-white/90'>{money(spent)}</div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className='mt-[18px] flex items-center justify-between border-t border-white/10 pt-[15px]'>
                  <div className='text-[12.5px] text-white/60'>Safe to spend daily</div>
                  <div className='font-mono text-[15px] text-[#7fd9e6]'>{money(Math.round(varLeft / m.daysLeft))}</div>
                </div>
              </div>

              {alert && (
                <button onClick={() => go('budget')} className='anim-pop mt-3.5 flex w-full items-center gap-3 rounded-[18px] border border-[#ec6a86]/30 bg-white px-4 py-3.5 text-left'>
                  <div className='grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px]' style={{ background: 'linear-gradient(155deg,#ffa9ba,#ec6a86 62%,#bc3f5c)', boxShadow: '0 5px 10px -4px rgba(236,106,134,.6), inset 0 1px 0 rgba(255,255,255,.55)' }}>
                    <div className='h-[13px] w-[2.5px] rounded-sm bg-white/95' />
                  </div>
                  <div className='flex-1'>
                    <div className='text-[13.5px] font-semibold text-ink'>{alert.title}</div>
                    <div className='mt-0.5 text-xs text-[#8b969b]'>{alert.body}</div>
                  </div>
                  <div className='text-xs font-semibold text-[#0b7b8f]'>Rebalance</div>
                </button>
              )}

              <div className='mb-3 mt-[26px] flex items-baseline justify-between'>
                <div className='text-[13px] font-bold text-ink'>Categories</div>
                <div className='font-mono text-[11.5px] text-[#8b969b]'>{l.cats.length} active</div>
              </div>
              <div className='flex flex-col gap-[9px]'>
                {cats.map((c) => (
                  <button key={c.id} onClick={() => { setDetail(c.id); setScreen('detail'); }} className={CARD + ' flex w-full items-center gap-3 px-4 py-3.5 text-left'}>
                    <Tile cat={c} size={44} />
                    <div className='min-w-0 flex-1'>
                      <div className='flex items-baseline justify-between gap-2.5'>
                        <div className='truncate text-sm font-semibold text-ink'>{c.name}</div>
                        <div className='shrink-0 font-mono text-[12.5px] text-ink'>{money(c.spent)}</div>
                      </div>
                      <div className='my-2 h-1.5 overflow-hidden rounded-full bg-[#eceff0]'>
                        <div className='h-full rounded-full' style={{ width: c.w + '%', background: c.meta.bar }} />
                      </div>
                      <div className='flex items-center justify-between gap-2.5'>
                        <div className='text-[11.5px]' style={{ color: c.meta.color }}>{c.meta.text}</div>
                        <div className='font-mono text-[11.5px] text-[#8b969b]'>of {money(c.budget, false)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className='mb-2.5 mt-[26px] flex items-baseline justify-between'>
                <div className='text-[13px] font-bold text-ink'>Recent</div>
                <button onClick={() => go('activity')} className='text-xs font-semibold text-[#0b7b8f]'>All activity</button>
              </div>
              <div className={CARD + ' overflow-hidden'}>{txSorted.slice(0, 4).map((t) => <Row key={t.id} t={t} />)}</div>
            </div>
          )}

          {screen === 'activity' && (
            <div className='px-[18px] pb-6'>
              <div className='mb-3.5 text-2xl font-bold tracking-[-0.015em] text-ink'>Activity</div>
              <div className='flex gap-[7px]'>
                {([['all', 'All'], ['mine', 'Just me'], ['split', 'Shared']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setFilter(k)} className={'flex h-8 items-center rounded-full border border-black/[0.09] px-3.5 text-[12.5px] font-semibold ' + chip(filter === k)}>{label}</button>
                ))}
              </div>
              <div className='mb-4 mt-2.5 font-mono text-[11.5px] text-[#8b969b]'>{groups.count} transactions · {money(groups.sum)}</div>
              {groups.list.map((g) => (
                <div key={g.key} className='mb-[18px]'>
                  <div className='mx-1 mb-2 flex items-baseline justify-between'>
                    <div className='text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#8b969b]'>{dayLabel(g.key)}</div>
                    <div className='font-mono text-[11.5px] text-[#8b969b]'>{money(g.items.reduce((a, t) => a + t.amount, 0))}</div>
                  </div>
                  <div className={CARD + ' overflow-hidden'}>{g.items.map((t) => <Row key={t.id} t={t} />)}</div>
                </div>
              ))}
            </div>
          )}

          {screen === 'budget' && (
            <div className='px-[18px] pb-6'>
              <div className='text-2xl font-bold tracking-[-0.015em] text-ink'>Budget setup</div>
              <div className='mb-[18px] mt-1 text-[13px] text-[#8b969b]'>{m.label} · net income {money(l.income, false)}</div>
              <div className={CARD + ' rounded-[22px] p-[18px]'}>
                <div className={LABEL}>Monthly ceiling</div>
                <div className='my-3 flex items-center gap-3.5'>
                  <button onClick={() => update((d) => { d.ceiling = Math.max(10000, d.ceiling - 5000); })} className='grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px] bg-canvas'>
                    <div className='h-[2.5px] w-[13px] rounded-sm bg-ink' />
                  </button>
                  <div className='flex-1 text-center font-mono text-[30px] tracking-[-0.03em] text-ink'>{money(l.ceiling, false)}</div>
                  <button onClick={() => update((d) => { d.ceiling += 5000; })} className='relative grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[13px] bg-canvas'>
                    <div className='absolute h-[2.5px] w-[13px] rounded-sm bg-ink' />
                    <div className='absolute h-[13px] w-[2.5px] rounded-sm bg-ink' />
                  </button>
                </div>
                <div className='text-center text-[11.5px] text-[#8b969b]'>{money(l.income - l.ceiling, false)} of net income stays unbudgeted</div>
                <div className='mb-2 mt-4 h-2 overflow-hidden rounded-full bg-[#eceff0]'>
                  <div className='h-full' style={{ width: Math.min(100, (alloc / l.ceiling) * 100) + '%', background: alloc > l.ceiling ? '#d8365b' : alloc < l.ceiling ? '#c8722a' : '#0b7b8f' }} />
                </div>
                <div className='flex justify-between font-mono text-[11.5px]'>
                  <span className='text-[#8b969b]'>allocated {money(alloc, false)}</span>
                  <span style={{ color: alloc > l.ceiling ? '#d8365b' : alloc < l.ceiling ? '#c8722a' : '#0b7b8f' }}>
                    {alloc === l.ceiling ? 'fully allocated' : alloc > l.ceiling ? money(alloc - l.ceiling, false) + ' over ceiling' : money(l.ceiling - alloc, false) + ' unallocated'}
                  </span>
                </div>
              </div>

              <div className='mb-3 mt-6 text-[13px] font-bold text-ink'>Category targets</div>
              <div className='flex flex-col gap-[9px]'>
                {cats.map((c) => (
                  <div key={c.id} className={CARD + ' px-4 py-3.5'}>
                    <div className='flex items-center gap-3'>
                      <Tile cat={c} size={34} />
                      <div className='min-w-0 flex-1'>
                        <div className='truncate text-[13.5px] font-semibold text-ink'>{c.name}</div>
                        <div className='mt-[3px] text-[11px] text-[#8b969b]'>{c.kind === 'fixed' ? 'Fixed' : 'Variable'} · {Math.round((c.budget / l.ceiling) * 100)}% of ceiling</div>
                      </div>
                      <div className='shrink-0 font-mono text-[15px] text-ink'>{money(c.budget, false)}</div>
                    </div>
                    <input
                      type='range' min={0} max={150000} step={1000} value={c.budget}
                      onChange={(e) => { const v = parseInt(e.target.value, 10); update((d) => { const t = d.cats.find((x) => x.id === c.id); if (t) t.budget = v; }); }}
                      className='mt-3 w-full' style={{ accentColor: c.c }}
                    />
                    <div className='mt-0.5 flex justify-between font-mono text-[10.5px] text-[#b3bcbf]'>
                      <span>0</span><span>spent {money(c.spent)}</span><span>{money(150000, false)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => setSheet('newcat')} className='mt-3 flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[18px] border-[1.5px] border-dashed border-black/[0.18]'>
                <div className='relative grid h-4 w-4 place-items-center'>
                  <div className='absolute h-0.5 w-3.5 rounded-sm bg-[#5b6a70]' />
                  <div className='absolute h-3.5 w-0.5 rounded-sm bg-[#5b6a70]' />
                </div>
                <span className='text-[13.5px] font-semibold text-[#5b6a70]'>Add category</span>
              </button>
            </div>
          )}

          {screen === 'detail' && detCat && (
            <div className='px-[18px] pb-6'>
              <button onClick={() => go('home')} className='mb-5 flex h-[34px] items-center gap-2 rounded-full border border-black/[0.08] bg-white pl-[11px] pr-3.5'>
                <div className='h-[7px] w-[7px] rotate-45 border-b-2 border-l-2 border-[#5b6a70]' />
                <span className='text-[12.5px] font-semibold text-[#5b6a70]'>Overview</span>
              </button>
              <div className='mb-[22px] flex items-center gap-[15px]'>
                <Tile cat={detCat} size={54} />
                <div>
                  <div className='text-[21px] font-bold tracking-[-0.01em] text-ink'>{detCat.name}</div>
                  <div className='mt-[5px] text-[12.5px] text-[#8b969b]'>{detCat.kind === 'fixed' ? 'Fixed' : 'Variable'} · {l.tx.filter((t) => t.cat === detCat.id).length} transactions</div>
                </div>
              </div>
              <div className={CARD + ' rounded-[22px] p-[18px]'}>
                <div className='flex items-end justify-between'>
                  <div>
                    <div className={LABEL}>Spent</div>
                    <div className='mt-1.5 font-mono text-[28px] tracking-[-0.03em] text-ink'>{money(detCat.spent)}</div>
                  </div>
                  <div className='text-right'>
                    <div className={LABEL}>Left</div>
                    <div className='mt-1.5 font-mono text-[17px]' style={{ color: detCat.meta.color }}>{money(detCat.budget - detCat.spent)}</div>
                  </div>
                </div>
                <div className='relative my-4 h-2.5 overflow-hidden rounded-full bg-[#eceff0]'>
                  <div className='h-full rounded-full' style={{ width: detCat.w + '%', background: detCat.meta.bar }} />
                </div>
                <div className='text-xs leading-relaxed text-[#5b6a70]'>
                  {detCat.kind === 'fixed'
                    ? detCat.spent >= detCat.budget
                      ? 'Fully funded this month.'
                      : money(detCat.budget - detCat.spent) + ' still to fund before month end.'
                    : 'Warning fires at ' + WARN_AT + '% of target, then again when the category is exceeded.'}
                </div>
              </div>
              <button onClick={() => go('budget')} className='my-3 flex h-[46px] w-full items-center justify-center rounded-2xl bg-deep text-[13.5px] font-semibold text-white'>Adjust this target</button>
              <div className='mb-2.5 mt-6 text-[13px] font-bold text-ink'>Transactions</div>
              <div className={CARD + ' overflow-hidden'}>{txSorted.filter((t) => t.cat === detCat.id).map((t) => <Row key={t.id} t={t} showTile={false} />)}</div>
            </div>
          )}

          {screen === 'me' && (
            <div className='px-[18px] pb-6'>
              <div className='mb-[18px] text-2xl font-bold tracking-[-0.015em] text-ink'>Account</div>
              <div className={CARD + ' flex items-center gap-3.5 rounded-[22px] p-[18px]'}>
                <div className='grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[18px]' style={{ background: 'linear-gradient(155deg,#7fd9e6,#17a8c0 62%,#0b7b8f)', boxShadow: '0 8px 16px -6px rgba(23,168,192,.6), inset 0 1px 0 rgba(255,255,255,.55)' }}>
                  <span className='text-[19px] font-bold text-white'>A</span>
                </div>
                <div className='flex-1'>
                  <div className='text-base font-bold text-ink'>Solo workspace</div>
                  <div className='mt-[3px] text-[12.5px] text-[#8b969b]'>One member · {l.tx.length} logged this month</div>
                </div>
              </div>

              <div className='mt-2.5 rounded-[22px] bg-deep p-[18px] text-white'>
                <div className='flex items-end justify-between'>
                  <div>
                    <div className='text-[9.5px] font-semibold uppercase tracking-[0.11em] text-white/50'>Unsettled from splits</div>
                    <div className='mt-[7px] font-mono text-[26px] tracking-[-0.03em]'>{money(unsettled(l))}</div>
                  </div>
                  <div className='max-w-[130px] text-right text-[11.5px] text-white/55'>owed to you once a partner joins</div>
                </div>
                <div className='mt-[15px] h-1.5 overflow-hidden rounded-full bg-white/15'>
                  <div className='h-full rounded-full bg-[#7fd9e6]' style={{ width: Math.min(100, spent ? (unsettled(l) / spent) * 100 : 0) + '%' }} />
                </div>
              </div>

              <div className={LABEL + ' mb-2.5 mt-6'}>Coming next</div>
              <div className='flex flex-col gap-[9px]'>
                {[
                  { t: 'Shared household', s: 'Invite a second account into one ledger', p: 'PHASE 2', g: 'linear-gradient(155deg,#d3b6f7,#a878e2 62%,#7a4bb5)' },
                  { t: 'Bank sync', s: 'Auto-import and categorise transactions', p: 'PHASE 3', g: 'linear-gradient(155deg,#a3b0ff,#6c7ff2 62%,#4757c9)' },
                ].map((x) => (
                  <div key={x.t} className={CARD + ' flex items-center gap-3 p-4 opacity-70'}>
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

              <div className={LABEL + ' mb-2.5 mt-6'}>Prototype data</div>
              <button onClick={() => { reset(); setToast('Seed data restored'); }} className={CARD + ' flex w-full items-center justify-between p-4 text-left'}>
                <div>
                  <div className='text-sm font-semibold text-ink'>Reset to seed data</div>
                  <div className='mt-[3px] text-xs text-[#8b969b]'>Clears this browser’s saved state</div>
                </div>
                <div className='text-[12.5px] font-semibold text-[#ec6a86]'>Reset</div>
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
                <div className='text-[17px] font-bold text-ink'>New expense</div>
                <button onClick={() => setSheet(null)} className='grid h-[30px] w-[30px] place-items-center rounded-full bg-black/[0.06] text-[#5b6a70]'>✕</button>
              </div>
              <div className='pb-2 pt-3.5 text-center'>
                <div className='font-mono text-[46px] tracking-[-0.04em]' style={{ color: draft.amount === '' ? '#c3cbce' : '#16242a' }}>
                  €{draft.amount === '' ? '0' : draft.amount}
                </div>
                <div className='mt-2 text-[11.5px] text-[#8b969b]'>{(byId[draft.cat] ?? cats[0]).name} · {dayLabel(draft.date)}</div>
              </div>
              <div className='-mx-[18px] flex gap-2.5 overflow-x-auto px-[18px] pb-3.5 pt-3'>
                {cats.map((c) => (
                  <button key={c.id} onClick={() => setDraft((d) => ({ ...d, cat: c.id }))} className='flex w-16 shrink-0 flex-col items-center gap-[7px]' style={{ opacity: draft.cat === c.id ? 1 : 0.42 }}>
                    <Tile cat={c} size={52} />
                    <div className='text-center text-[9.5px] font-semibold leading-tight text-[#5b6a70]'>{c.short}</div>
                  </button>
                ))}
              </div>
              <div className='mb-2.5 flex gap-2'>
                {[0, 1].map((off) => {
                  const d = new Date(); d.setDate(d.getDate() - off);
                  const v = iso(d);
                  return (
                    <button key={off} onClick={() => setDraft((x) => ({ ...x, date: v }))} className={'flex h-9 items-center rounded-xl px-3.5 text-[12.5px] font-semibold ' + chip(draft.date === v)}>{off === 0 ? 'Today' : 'Yesterday'}</button>
                  );
                })}
                <input type='date' value={draft.date} onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} className='h-9 flex-1 rounded-xl bg-white px-2.5 font-mono text-[12.5px] text-ink' />
              </div>
              <div className='mb-2.5 flex gap-2'>
                {([['mine', 'Just me'], ['half', 'Split 50/50'], ['custom', 'Custom %']] as const).map(([k, label]) => {
                  const on = k === 'mine' ? draft.scope === 'mine' : k === 'half' ? draft.scope === 'split' && draft.pct === 50 : draft.scope === 'split' && draft.pct !== 50;
                  return (
                    <button key={k} onClick={() => setDraft((d) => (k === 'mine' ? { ...d, scope: 'mine' } : { ...d, scope: 'split', pct: k === 'half' ? 50 : d.pct === 50 ? 60 : d.pct }))} className={'h-9 flex-1 rounded-xl text-[12.5px] font-semibold ' + chip(on)}>{label}</button>
                  );
                })}
              </div>
              {draft.scope === 'split' && (
                <div className='mb-2.5 flex items-center gap-3 rounded-2xl bg-white p-3'>
                  <button onClick={() => setDraft((d) => ({ ...d, pct: Math.max(0, d.pct - 5) }))} className='grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-canvas'>
                    <div className='h-[2.5px] w-2.5 rounded-sm bg-ink' />
                  </button>
                  <div className='flex-1 text-center'>
                    <div className='font-mono text-[13px] text-ink'>You {draft.pct}% · Partner {100 - draft.pct}%</div>
                    <div className='mt-1.5 text-[10.5px] text-[#8b969b]'>{money(Math.round(amountValue * 100 * draft.pct / 100))} counts against your budget</div>
                  </div>
                  <button onClick={() => setDraft((d) => ({ ...d, pct: Math.min(100, d.pct + 5) }))} className='relative grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-canvas'>
                    <div className='absolute h-[2.5px] w-2.5 rounded-sm bg-ink' />
                    <div className='absolute h-2.5 w-[2.5px] rounded-sm bg-ink' />
                  </button>
                </div>
              )}
              <input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder='Note (optional)' className='mb-3.5 h-10 w-full rounded-xl bg-white px-3.5 text-[13.5px] text-ink outline-none' />
              <div className='grid grid-cols-3 gap-2'>
                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
                  <button key={k} onClick={() => pressKey(k)} className='grid h-[50px] select-none place-items-center rounded-[15px] bg-white font-mono text-[21px] text-ink shadow-[0_1px_2px_rgba(22,36,42,.06)] active:bg-[#e9eef0]'>
                    {k === 'del' ? '⌫' : k}
                  </button>
                ))}
              </div>
              <button onClick={save} disabled={amountValue <= 0} className='mt-3 h-[54px] w-full rounded-[18px] text-[15px] font-bold text-white' style={{ background: amountValue > 0 ? '#12303a' : 'rgba(22,36,42,.22)' }}>
                {amountValue > 0 ? 'Save ' + money(Math.round(amountValue * 100)) : 'Enter an amount'}
              </button>
            </div>
          </>
        )}

        {sheet === 'tx' && (() => {
          const t = l.tx.find((x) => x.id === viewTx);
          if (!t) return null;
          const c = byId[t.cat] ?? cats[0];
          return (
            <>
              <div className='anim-fade absolute inset-0 bg-[rgba(11,20,24,.42)]' onClick={() => setSheet(null)} />
              <div className='anim-sheet absolute inset-x-0 bottom-0 rounded-t-[30px] bg-canvas px-[18px] pb-6 pt-2.5'>
                <div className='mx-auto mb-[18px] mt-0.5 h-1 w-[38px] rounded-full bg-black/15' />
                <div className='mb-5 flex items-center gap-3.5'>
                  <Tile cat={c} size={46} />
                  <div className='flex-1'>
                    <div className='text-[17px] font-bold text-ink'>{t.note || c.name}</div>
                    <div className='mt-1 text-[12.5px] text-[#8b969b]'>{c.name} · {dayLabel(t.date)} · {t.scope === 'split' ? 'Split ' + t.pct + '/' + (100 - t.pct) : 'Just me'}</div>
                  </div>
                  <div className='font-mono text-2xl tracking-[-0.02em] text-ink'>{money(t.amount)}</div>
                </div>
                <div className='flex gap-2.5'>
                  <button onClick={() => setSheet(null)} className='h-[50px] flex-1 rounded-[17px] bg-white text-sm font-semibold text-ink'>Close</button>
                  <button onClick={() => { update((d) => { d.tx = d.tx.filter((x) => x.id !== t.id); }); setSheet(null); setToast('Transaction deleted'); }} className='h-[50px] flex-1 rounded-[17px] bg-[#ec6a86] text-sm font-semibold text-white'>Delete</button>
                </div>
              </div>
            </>
          );
        })()}

        {sheet === 'newcat' && (
          <>
            <div className='anim-fade absolute inset-0 bg-[rgba(11,20,24,.42)]' onClick={() => setSheet(null)} />
            <div className='anim-sheet absolute inset-x-0 bottom-0 rounded-t-[30px] bg-canvas px-[18px] pb-6 pt-2.5'>
              <div className='mx-auto mb-3.5 mt-0.5 h-1 w-[38px] rounded-full bg-black/15' />
              <div className='mb-4 text-[17px] font-bold text-ink'>New category</div>
              <input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} placeholder='Name, e.g. Travel fund' className='mb-2.5 h-[46px] w-full rounded-2xl bg-white px-3.5 text-[14.5px] font-medium text-ink outline-none' />
              <div className='mb-3 flex gap-2.5'>
                <input value={nc.budget} onChange={(e) => setNc({ ...nc, budget: e.target.value })} inputMode='numeric' placeholder='Target' className='h-[46px] flex-1 rounded-2xl bg-white px-3.5 font-mono text-[14.5px] text-ink outline-none' />
                {([['variable', 'Variable'], ['fixed', 'Fixed']] as const).map(([k, label]) => (
                  <button key={k} onClick={() => setNc({ ...nc, kind: k })} className={'h-[46px] flex-1 rounded-2xl text-[13px] font-semibold ' + chip(nc.kind === k)}>{label}</button>
                ))}
              </div>
              <div className='mb-[18px] flex gap-2.5'>
                {PALETTE.map((p, i) => (
                  <button key={i} onClick={() => setNc({ ...nc, ci: i })} className='h-10 flex-1 rounded-[13px]' style={{ background: 'linear-gradient(155deg,' + p.cl + ',' + p.c + ' 60%,' + p.cd + ')', boxShadow: nc.ci === i ? '0 0 0 3px #12303a' : 'inset 0 1px 0 rgba(255,255,255,.5)' }} />
                ))}
              </div>
              <button
                onClick={() => {
                  if (!nc.name.trim()) return;
                  const p = PALETTE[nc.ci];
                  update((d) => {
                    d.cats.push({
                      id: 'c' + Date.now(), name: nc.name.trim(), short: nc.name.trim().split(' ')[0],
                      kind: nc.kind, budget: (parseInt(nc.budget, 10) || 0) * 100,
                      mark: MARKS[d.cats.length % MARKS.length], ...p,
                    });
                  });
                  setToast(nc.name.trim() + ' added');
                  setNc({ name: '', budget: '', kind: 'variable', ci: 4 });
                  setSheet(null);
                }}
                className='h-[54px] w-full rounded-[18px] text-[15px] font-bold text-white'
                style={{ background: nc.name.trim() ? '#12303a' : 'rgba(22,36,42,.22)' }}
              >
                Create category
              </button>
            </div>
          </>
        )}

        <nav className='absolute inset-x-0 bottom-0 flex h-[82px] items-start border-t border-black/[0.07] bg-white/95 px-2 pt-2.5 backdrop-blur-xl'>
          {([['home', 'Overview'], ['activity', 'Activity'], ['spacer', ''], ['budget', 'Budget'], ['me', 'Account']] as const).map(([k, label]) =>
            k === 'spacer' ? (
              <div key='spacer' className='flex-1' />
            ) : (
              <button key={k} onClick={() => go(k as Screen)} className='flex flex-1 flex-col items-center gap-1.5 pt-1.5'>
                <TabIcon kind={k === 'me' ? 'me' : (k as 'home' | 'activity' | 'budget')} on={screen === k || (k === 'home' && screen === 'detail')} />
                <div className='text-[9.5px] font-semibold' style={{ color: screen === k || (k === 'home' && screen === 'detail') ? '#12303a' : '#a8b2b6' }}>{label}</div>
              </button>
            )
          )}
          <button
            onClick={() => setSheet('log')}
            aria-label='Log an expense'
            className='absolute left-1/2 top-[-16px] grid h-[58px] w-[58px] -translate-x-1/2 place-items-center rounded-[22px]'
            style={{ background: 'linear-gradient(155deg,#7fd9e6,#17a8c0 58%,#0b7b8f)', boxShadow: '0 12px 22px -8px rgba(11,123,143,.75), inset 0 1px 0 rgba(255,255,255,.5)' }}
          >
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

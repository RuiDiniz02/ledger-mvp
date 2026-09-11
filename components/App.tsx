'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Tile, TabIcon } from './Icons';
import Onboarding from './Onboarding';
import { useLedger } from '@/lib/store';
import { money, dayLabel } from '@/lib/format';
import {
  MARKS, PALETTE, UNCAT_ID, allocated, catState, ensureMonth, iso, makeCategory, monthBudget, monthMeta,
  catHistory, ceilingIn, distributed, makeExtra, monthFreed, monthSaved, monthSpent, monthsToGoal, orphanTx,
  poolAt, poolSources, potAt, searchTx, targetIn, shiftYm, spentBy, txOfMonth, uid, uncatFor,
  splitsOn, unsettled, used, ymLabel, ymNow, ymOf,
} from '@/lib/data';
import { copyBackup, parseBackup, readFile, saveBackup, summarize, type Summary } from '@/lib/backup';
import { makeT } from '@/lib/i18n';
import { tap, feedbackOn, setFeedback } from '@/lib/tap';
import type { Category, Kind, Lang, Ledger, MarkKind, Tx } from '@/lib/types';

const WARN_AT = 80;
const CARD = 'rounded-[20px] border border-black/[0.06] bg-white';
const LABEL = 'text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b969b]';
/** Sheets must sit above the tab bar (z-10), which owns the bottom 82px. */
const SCRIM = 'anim-fade absolute inset-0 z-40 bg-[rgba(11,20,24,.42)]';
const SHEET = 'anim-sheet absolute inset-x-0 bottom-0 z-50 rounded-t-[30px] bg-canvas';

type Screen = 'home' | 'activity' | 'budget' | 'me' | 'detail';
type Draft = { id: string | null; amount: string; cat: string; date: string; note: string; scope: 'mine' | 'split'; pct: number };
type CatForm = { id: string | null; name: string; kind: Kind; ci: number; target: string; mark: MarkKind; goal: string };
type Sheet = null | 'log' | 'tx' | 'cat' | 'import' | 'pool' | 'add';
/** What to do with the expenses of a category being deleted. */
type CatDelete = { count: number; mode: 'uncat' | 'move' | 'purge'; dest: string };

const toCents = (s: string) => Math.round((parseFloat((s || '').replace(',', '.')) || 0) * 100);
const fromCents = (c: number) => (c ? String(c / 100) : '');
const emptyDraft = (): Draft => ({ id: null, amount: '', cat: '', date: iso(new Date()), note: '', scope: 'mine', pct: 50 });

export default function App() {
  const { data, update, replace, reset, storage } = useLedger();
  const [screen, setScreen] = useState<Screen>('home');
  const [ym, setYm] = useState<string>(ymNow());
  const [detail, setDetail] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [viewTx, setViewTx] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine' | 'split'>('all');
  const [query, setQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [form, setForm] = useState<CatForm>({ id: null, name: '', kind: 'variable', ci: 4, target: '', mark: MARKS[0], goal: '' });
  const [fb, setFb] = useState(true);
  // Raw keystrokes for the ceiling field, so "12.50" survives being typed.
  const [ceilDraft, setCeilDraft] = useState<string | null>(null);
  const [armDelete, setArmDelete] = useState(false);
  const [catDel, setCatDel] = useState<CatDelete | null>(null);
  const [incoming, setIncoming] = useState<{ ledger: Ledger; summary: Summary } | null>(null);
  const [installer, setInstaller] = useState<{ prompt: () => Promise<void> } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [give, setGive] = useState<Record<string, number>>({});
  const [bring, setBring] = useState('');

  useEffect(() => { setFb(feedbackOn()); }, []);

  useEffect(() => {
    if (!toast) return;
    const x = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(x);
  }, [toast]);

  useEffect(() => { setCeilDraft(null); }, [ym]);
  // poolAt walks every month on record, so it must not run on every keystroke.
  const pool = useMemo(() => (data && data.onboarded ? poolAt(data, ym) : 0), [data, ym]);
  const sources = useMemo(() => (data && data.onboarded ? poolSources(data, ym) : { carried: 0, freed: 0, added: 0 }), [data, ym]);
  useEffect(() => { setArmDelete(false); setCatDel(null); }, [sheet, viewTx]);

  // Chrome and Android offer a real install prompt; iOS has none, so Account
  // falls back to written instructions there.
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      const ev = e as Event & { prompt: () => Promise<void> };
      setInstaller({ prompt: () => ev.prompt() });
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  // The phone's back gesture should dismiss whatever is on top, not leave the
  // app. One history entry stands for "there is something to dismiss".
  const held = useRef(false);
  const selfPop = useRef(false);
  const overlay = sheet !== null || screen === 'detail';
  useEffect(() => {
    if (overlay && !held.current) {
      held.current = true;
      try { window.history.pushState({ ledgerOverlay: true }, ''); } catch { held.current = false; }
    } else if (!overlay && held.current) {
      held.current = false;
      selfPop.current = true;
      try { window.history.back(); } catch { selfPop.current = false; }
    }
  });
  useEffect(() => {
    const onPop = () => {
      if (selfPop.current) { selfPop.current = false; return; }
      held.current = false;
      if (sheet) { tap('back'); setSheet(null); }
      else if (screen === 'detail') { setScreen('home'); setDetail(null); }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [sheet, screen]);

  // A sheet is a modal: Escape closes it, and on desktop a physical keyboard drives the keypad.
  const keys = useRef<{ press: (k: string) => void; save: () => void } | null>(null);
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); tap('back'); setSheet(null); return; }
      if (sheet !== 'log' || !keys.current) return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (/^[0-9]$/.test(e.key)) { e.preventDefault(); keys.current.press(e.key); }
      else if (e.key === '.' || e.key === ',') { e.preventDefault(); keys.current.press('.'); }
      else if (e.key === 'Backspace') { e.preventDefault(); keys.current.press('del'); }
      else if (e.key === 'Enter') { e.preventDefault(); keys.current.save(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheet]);

  if (!data) return <main className='min-h-screen' />;
  const l: Ledger = data;
  if (!l.onboarded) return <Onboarding update={update} />;

  const t = makeT(l.lang);
  const lang: Lang = l.lang;
  const $ = (c: number, dec = true) => money(c, dec, lang);
  const m = monthMeta(ym);
  const mb = monthBudget(l, ym);

  // Expenses left behind by a deleted category still count toward the month, so
  // they get their own read-only card rather than quietly inflating the total.
  const orphans = orphanTx(l, ym);
  const shown: Array<Category & { virtual?: boolean }> = orphans.length
    ? [...l.cats, { ...uncatFor(lang), virtual: true }]
    : l.cats;

  const cats = shown.map((c) => {
    const virtual = c.virtual === true;
    const target = virtual ? 0 : targetIn(l, ym, c.id);
    const sp = virtual ? orphans.reduce((a, t) => a + t.amount, 0) : spentBy(l, ym, c.id);
    // What this category costs the month, which is not the same as what was logged.
    const cost = virtual ? sp : used(c.kind, target, sp);
    const pot = c.kind === 'saving' && !virtual;
    const ps = pot ? potAt(l, c, ym) : null;
    const balance = ps ? ps.balance : 0;
    const st = catState(c.kind, target, sp, WARN_AT);
    const pct = target > 0 ? Math.round((sp / target) * 100) : 0;
    const meta =
      virtual ? { color: '#8b969b', text: t('uncatBody'), bar: c.c }
      : pot ? (
          // Full *and* took nothing. The month it fills up, it did still contribute.
          ps && ps.full && ps.contribution === 0 ? { color: '#0b7b8f', text: t('potFull'), bar: c.c }
          : { color: sp > 0 ? '#c8722a' : '#8b969b', text: (sp > 0 ? '−' + $(sp) : '+' + $(ps ? ps.contribution : target)) + ' ' + t('thisMonthShort'), bar: c.c }
        )
      // A fixed category is money you had to spend, so it is reported against the
      // plan rather than praised as "funded" or scolded as "over budget".
      : c.kind === 'fixed' ? (
          sp > target
            ? { color: '#d8365b', text: t('overPlanned', { amount: $(sp - target) }), bar: '#ec6a86' }
            : { color: '#8b969b', text: t('ofPlanned', { n: pct }), bar: c.c }
        )
      : st === 'over' ? { color: '#d8365b', text: $(sp - target) + ' ' + t('overBy'), bar: '#ec6a86' }
      : st === 'funded' ? { color: '#0b7b8f', text: t('funded'), bar: c.c }
      : st === 'near' ? { color: '#c8722a', text: pct + '% ' + t('used') + ' — ' + t('tight'), bar: '#f4874b' }
      : st === 'empty' ? { color: '#8b969b', text: t('noTarget'), bar: c.c }
      : { color: '#8b969b', text: pct + '% ' + t('used'), bar: c.c };
    const goal = ps && ps.goal ? ps.goal : 0;
    return {
      ...c, virtual, pot, target, spent: sp, cost, balance, st, meta,
      goal, full: ps ? ps.full : false, freed: ps ? ps.freed : 0,
      toGoal: ps ? monthsToGoal(ps) : null,
      // A pot fills towards its goal; everything else fills towards the month's target.
      w: goal > 0 ? Math.min(100, Math.max(0, (balance / goal) * 100))
        : target > 0 ? Math.min(100, (cost / target) * 100) : 0,
    };
  });
  /** Real categories only — the uncategorised bucket has no budget to set. */
  const realCats = cats.filter((c) => !c.virtual);
  const byId = Object.fromEntries(cats.map((c) => [c.id, c]));
  // Spending is money that left. Saving is money put away, which is equally
  // gone from what you can spend but is not spending. Allocation is neither.
  const spent = monthSpent(l, ym);
  const saved = monthSaved(l, ym);
  const alloc = l.cats.reduce((a, c) => a + targetIn(l, ym, c.id), 0);
  const ceiling = ceilingIn(l, ym);
  const remaining = ceiling - spent - saved;
  const varLeft = cats.filter((c) => c.kind === 'variable').reduce((a, c) => a + Math.max(0, c.target - c.spent), 0);
  const monthTx = txOfMonth(l, ym).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id < b.id ? 1 : -1));

  let acc = 0;
  const parts: string[] = [];
  cats.filter((c) => c.cost > 0).forEach((c) => {
    const share = Math.min(100 - acc, (c.cost / Math.max(ceiling || spent + saved, spent + saved, 1)) * 100);
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

  // Navigating always dismisses an open sheet, so it can never hang over another screen.
  const go = (s: Screen) => { tap('light'); setSheet(null); setScreen(s); setDetail(null); };
  const closeSheet = () => { tap('back'); setSheet(null); };
  const chip = (on: boolean) => (on ? 'bg-deep text-white' : 'bg-white text-[#5b6a70]');
  const sharing = splitsOn(l);
  const kindLabel = (k: Kind) => (k === 'fixed' ? t('fixed') : k === 'saving' ? t('saving') : t('variable'));
  const monthInitial = (k: string) => ymLabel(k, lang).slice(0, 3);
  const nTx = (n: number) => n + ' ' + t(n === 1 ? 'unitTx' : 'unitTxs');

  const openLog = (preset?: string) => {
    tap('light');
    if (!l.cats.length) { go('budget'); setToast(t('noCatsBody')); return; }
    const recent = l.tx.length ? l.tx[l.tx.length - 1].cat : null;
    const fallback = recent && l.cats.some((c) => c.id === recent) ? recent : l.cats[0].id;
    setDraft({ ...emptyDraft(), cat: preset && l.cats.some((c) => c.id === preset) ? preset : fallback });
    setSheet('log');
  };

  /** Reopens the log sheet over an existing expense instead of forcing a delete and retype. */
  const openEdit = (x: Tx) => {
    tap('light');
    const known = l.cats.some((c) => c.id === x.cat);
    setDraft({
      id: x.id,
      amount: String(x.amount / 100),
      cat: known ? x.cat : l.cats.length ? l.cats[0].id : x.cat,
      date: x.date,
      note: x.note,
      scope: x.scope,
      pct: x.scope === 'split' ? x.pct : 50,
    });
    setSheet('log');
  };

  const openCatForm = (c?: Category) => {
    if (c) {
      const ci = PALETTE.findIndex((p) => p.c === c.c);
      setForm({ id: c.id, name: c.name, kind: c.kind, ci: ci < 0 ? 4 : ci, target: fromCents(mb.targets[c.id] || 0), mark: c.mark, goal: fromCents(c.goal || 0) });
    } else setForm({ id: null, name: '', kind: 'variable', ci: 4, target: '', mark: MARKS[l.cats.length % MARKS.length], goal: '' });
    setSheet('cat');
  };

  const saveCat = () => {
    if (!form.name.trim()) return;
    const p = PALETTE[form.ci];
    update((d) => {
      const b = ensureMonth(d, ym);
      if (form.id) {
        const c = d.cats.find((x) => x.id === form.id);
        if (c) {
          c.name = form.name.trim(); c.kind = form.kind; c.mark = form.mark;
          c.c = p.c; c.cl = p.cl; c.cd = p.cd;
          const g = form.kind === 'saving' ? toCents(form.goal) : 0;
          if (g > 0) c.goal = g; else delete c.goal;
        }
        b.targets[form.id] = toCents(form.target);
      } else {
        const c = makeCategory(form.name.trim(), form.kind, form.ci, d.cats.length, form.mark);
        const g = form.kind === 'saving' ? toCents(form.goal) : 0;
        if (g > 0) c.goal = g;
        d.cats.push(c);
        b.targets[c.id] = toCents(form.target);
      }
    });
    tap('confirm');
    setToast(form.name.trim() + ' ' + (form.id ? t('updated') : t('added')));
    setSheet(null);
  };

  /** Opens the delete panel, pre-answering the question when nothing depends on it. */
  const askDeleteCat = () => {
    if (!form.id) return;
    const count = l.tx.filter((x) => x.cat === form.id).length;
    const dest = l.cats.find((c) => c.id !== form.id)?.id ?? '';
    tap('light');
    setCatDel({ count, mode: count && dest ? 'move' : 'uncat', dest });
  };

  const deleteCat = () => {
    const id = form.id;
    const plan = catDel;
    if (!id || !plan) return;
    update((d) => {
      if (plan.mode === 'purge') d.tx = d.tx.filter((x) => x.cat !== id);
      else if (plan.mode === 'move' && plan.dest) d.tx.forEach((x) => { if (x.cat === id) x.cat = plan.dest; });
      // 'uncat' leaves the rows pointing at a category that no longer exists;
      // they surface under the Uncategorised card.
      d.cats = d.cats.filter((c) => c.id !== id);
      Object.values(d.months).forEach((b) => { delete b.targets[id]; });
    });
    tap('back');
    setCatDel(null);
    setSheet(null);
    setScreen('budget');
    setDetail(null);
    setToast(t('catDeleted', { name: form.name.trim() }));
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
    const editing = draft.id;
    const fields = {
      cat: draft.cat, amount: cents, date: draft.date, note: draft.note || cat.name,
      scope: draft.scope, pct: draft.scope === 'split' ? draft.pct : 100,
    };
    update((d) => {
      if (editing) {
        const row = d.tx.find((x) => x.id === editing);
        // The row keeps its id, paidBy and source, so an edit never rewrites provenance.
        if (row) Object.assign(row, fields);
      } else {
        d.tx.push({ id: uid('u'), ...fields, paidBy: 'me', source: 'manual' });
      }
      ensureMonth(d, ymOf(draft.date));
    });
    tap('confirm');
    setYm(ymOf(draft.date));
    setSheet(null);
    setDraft({ ...emptyDraft(), cat: draft.cat });
    setToast(
      editing ? t('txUpdated') + ' · ' + $(cents)
      : cat.kind === 'saving' ? t('potWithdrawn', { name: cat.name }) + ' · ' + $(cents)
      : t('logged') + ' ' + $(cents) + ' · ' + cat.name
    );
  };

  keys.current = { press: pressKey, save: saveTx };

  // Distribution is drafted in state and written once, so a half-finished
  // hand-out never lands in the ledger.
  const given = Object.values(give).reduce((a, n) => a + n, 0);
  const left = Math.max(0, pool - given);
  const step = Math.max(100, Math.min(10000, Math.round(pool / 10 / 500) * 500 || 500));
  const bump = (key: string, delta: number) =>
    setGive((g) => {
      const now = g[key] || 0;
      const next = Math.max(0, Math.min(now + delta, now + Math.max(0, pool - Object.values(g).reduce((a, n) => a + n, 0))));
      const out = { ...g };
      if (next <= 0) delete out[key]; else out[key] = next;
      return out;
    });
  const giveEverything = (key: string) =>
    setGive((g) => {
      const rest = pool - Object.values(g).reduce((a, n) => a + n, 0);
      if (rest <= 0) return g;
      return { ...g, [key]: (g[key] || 0) + rest };
    });

  const saveBring = () => {
    const cents = toCents(bring);
    if (cents <= 0) return;
    update((d) => {
      const b = ensureMonth(d, ym);
      b.added = (b.added || 0) + cents;
    });
    tap('confirm');
    setBring('');
    setSheet(null);
    setToast(t('addMoneyDone', { amount: $(cents) }));
  };

  const saveGive = () => {
    const entries = Object.entries(give).filter(([, n]) => n > 0);
    if (!entries.length) return;
    // Whatever the pot released this month is spent first, then the carried money.
    let freedLeft = sources.freed;
    update((d) => {
      const b = ensureMonth(d, ym);
      b.extra = b.extra || [];
      for (const [key, amount] of entries) {
        const fromFreed = Math.min(freedLeft, amount);
        freedLeft -= fromFreed;
        if (fromFreed > 0) b.extra.push(makeExtra('freed', key, fromFreed));
        if (amount - fromFreed > 0) b.extra.push(makeExtra('carry', key, amount - fromFreed));
      }
    });
    tap('confirm');
    setGive({});
    setSheet(null);
    setToast(t('extraGiven', { amount: $(given) }));
  };

  const doExport = async () => {
    tap('light');
    const result = await saveBackup(l);
    if (result === 'failed') { setToast(t('exportFailed')); return; }
    update((d) => { d.lastExport = new Date().toISOString(); });
    tap('confirm');
    setToast(t('exported'));
  };

  const doCopy = async () => {
    tap('light');
    if (!(await copyBackup(l))) { setToast(t('exportFailed')); return; }
    update((d) => { d.lastExport = new Date().toISOString(); });
    tap('confirm');
    setToast(t('exportCopied'));
  };

  const doPickImport = async (file: File | null) => {
    if (!file) return;
    let text = '';
    try { text = await readFile(file); } catch { setToast(t('importBad')); return; }
    const parsed = parseBackup(text);
    if (!parsed.ok) { setToast(parsed.reason === 'newer' ? t('importNewer') : t('importBad')); return; }
    // Confirm before replacing, with a summary of what is actually in the file.
    setIncoming({ ledger: parsed.ledger, summary: summarize(parsed.ledger) });
    setSheet('import');
  };

  const doImport = () => {
    if (!incoming) return;
    replace(incoming.ledger);
    tap('confirm');
    setIncoming(null);
    setSheet(null);
    setScreen('home');
    setYm(ymNow());
    setToast(t('importDone'));
  };

  // Live impact of the draft on the chosen category, shown while typing.
  const draftCat = byId[draft.cat];
  const draftCents = Math.round(amountValue * 100);
  const draftShare = draft.scope === 'split' ? Math.round((draftCents * draft.pct) / 100) : draftCents;
  // What this expense does, said in the terms of the category it lands in.
  const impact = (() => {
    if (!draftCat) return null;
    const already = draft.id ? l.tx.find((x) => x.id === draft.id) : null;
    // When editing, the row's own old amount must not count against itself.
    const others = draftCat.spent - (already && already.cat === draftCat.id ? already.amount : 0);
    if (draftCat.pot) {
      const after = draftCat.balance + (already && already.cat === draftCat.id ? already.amount : 0) - draftShare;
      return { over: after < 0, text: $(after) + ' ' + t('takeFromPot', { name: draftCat.name }) };
    }
    if (draftCat.target <= 0) return { over: false, text: t('noTargetYet', { name: draftCat.name }) };
    const total = others + draftShare;
    if (total > draftCat.target) {
      return { over: true, text: t('willExceed', { name: draftCat.name, amount: $(total - draftCat.target) }) };
    }
    return { over: false, text: $(draftCat.target - total) + ' ' + t('leftAfter', { name: draftCat.name }) };
  })();

  const Row = ({ tx, showTile = true }: { tx: Tx; showTile?: boolean }) => {
    const c = byId[tx.cat] || byId[UNCAT_ID];
    return (
      <button onClick={() => { tap('light'); setViewTx(tx.id); setSheet('tx'); }} className='flex w-full items-center gap-3 border-t border-black/[0.05] px-[15px] py-3 text-left first:border-t-0'>
        {showTile && c && <Tile cat={c} size={34} />}
        <div className='min-w-0 flex-1'>
          <div className='truncate text-[13.5px] font-semibold text-ink'>{tx.note || (c ? c.name : '—')}</div>
          <div className='mt-[3px] text-[11.5px] text-[#8b969b]'>
            {(c ? c.name : '—') + ' · ' + dayLabel(tx.date, lang) + (c && c.pot ? ' · ' + t('fromPot') : '') + (tx.scope === 'split' ? ' · ' + tx.pct + '/' + (100 - tx.pct) : '')}
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

  // A search reaches every month; without one, Activity stays month-scoped.
  const hits = query.trim() ? searchTx(l, query).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)) : null;

  const detCat = cats.find((c) => c.id === detail);
  const detTx = !detCat ? [] : detCat.virtual ? orphans : monthTx.filter((x) => x.cat === detCat.id);
  const catMonths = detCat && !detCat.virtual ? catHistory(l, detCat, ym, 6) : [];
  const prev = catMonths.length > 1 ? catMonths[catMonths.length - 2].value : 0;
  const now = catMonths.length ? catMonths[catMonths.length - 1].value : 0;
  // A pot going up is good news; a category costing more is not.
  const trend =
    catMonths.length < 2 || prev === 0 || now === prev
      ? null
      : detCat && detCat.pot
      ? { text: (now > prev ? '+' : '−') + $(Math.abs(now - prev), false) + ' ' + t('vsLastMonth'), color: now > prev ? '#0b7b8f' : '#c8722a' }
      : { text: $(Math.abs(now - prev), false) + ' ' + t(now > prev ? 'moreThanLast' : 'lessThanLast'), color: now > prev ? '#c8722a' : '#0b7b8f' };
  const filtered = hits ?? monthTx.filter((x) => filter === 'all' || x.scope === filter);
  const groupMap: Record<string, Tx[]> = {};
  filtered.forEach((x) => { (groupMap[x.date] = groupMap[x.date] || []).push(x); });
  const groupKeys = Object.keys(groupMap).sort().reverse();

  return (
    <main className='mx-auto flex h-[100dvh] max-w-[430px] flex-col overflow-hidden bg-canvas shadow-[0_0_60px_-20px_rgba(18,48,58,.25)]'>
      <div className='relative min-h-0 flex-1'>
        <div className='h-full overflow-y-auto overscroll-contain pb-[110px] pt-6'>

          {screen === 'home' && (
            <div className='px-[18px] pb-6'>
              <div className='mb-5 flex items-center justify-between'>
                <div>
                  <div className='text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8b969b]'>{l.workspace}</div>
                  <div className='mt-1 text-2xl font-bold tracking-[-0.015em] text-ink'>{t('overview')}</div>
                </div>
                <div className='flex items-center gap-1 rounded-full border border-black/[0.08] bg-white px-1.5 py-1'>
                  <button onClick={() => { tap('light'); setYm(shiftYm(ym, -1)); }} className='grid h-7 w-7 place-items-center text-[#5b6a70]'>‹</button>
                  <span className='px-1 text-[12px] font-semibold text-ink'>{ymLabel(ym, lang)}</span>
                  <button onClick={() => { tap('light'); setYm(shiftYm(ym, 1)); }} className='grid h-7 w-7 place-items-center text-[#5b6a70]'>›</button>
                </div>
              </div>

              {ceiling <= 0 ? (
                <button onClick={() => go('budget')} className='block w-full text-left'>
                  <Empty title={t('noBudget')} body={t('noBudgetBody')} />
                </button>
              ) : (
                <div className='rounded-[26px] bg-deep p-[22px] text-white shadow-[0_18px_34px_-20px_rgba(18,48,58,.7)]'>
                  <div className='flex items-center gap-5'>
                    <div className='grid h-28 w-28 shrink-0 place-items-center rounded-full' style={{ background: donut }}>
                      <div className='grid h-[78px] w-[78px] place-items-center rounded-full bg-deep text-center'>
                        <div>
                          <div className='font-mono text-[21px] tracking-tight'>{Math.round(((spent + saved) / ceiling) * 100)}%</div>
                          <div className='mt-[5px] text-[8.5px] font-semibold uppercase tracking-[0.1em] text-white/50'>{t('spent')}</div>
                        </div>
                      </div>
                    </div>
                    <div className='min-w-0 flex-1'>
                      <div className='text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/50'>{t('remaining')}</div>
                      <div className='mt-1 font-mono text-[27px] tracking-[-0.03em]'>{$(remaining)}</div>
                    </div>
                  </div>
                  {/* Full width, below the donut: three of these never fit beside it. */}
                  <div className='mt-[18px] flex gap-3 border-t border-white/10 pt-[15px]'>
                    {([
                      [t('budgetLabel'), $(ceiling, false), 'rgba(255,255,255,.9)'],
                      [t('spent'), $(spent), 'rgba(255,255,255,.9)'],
                      ...(saved > 0 ? [[t('savedLabel'), $(saved), '#7fd9e6'] as const] : []),
                    ] as const).map(([label, value, colour]) => (
                      <div key={label} className='min-w-0 flex-1'>
                        <div className='truncate text-[9.5px] font-semibold uppercase tracking-[0.1em] text-white/50'>{label}</div>
                        <div className='mt-1 truncate font-mono text-sm' style={{ color: colour }}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {m.isCurrent && (
                    <div className='mt-3.5 flex items-center justify-between border-t border-white/10 pt-3.5'>
                      <div className='text-[12.5px] text-white/60'>{t('safeDaily')}</div>
                      <div className='font-mono text-[15px] text-[#7fd9e6]'>{$(Math.round(varLeft / m.daysLeft))}</div>
                    </div>
                  )}
                </div>
              )}

              {pool > 0 && (
                <button
                  onClick={() => { tap('light'); setGive({}); setSheet('pool'); }}
                  className='anim-pop mt-3.5 flex w-full items-center gap-3 rounded-[18px] border border-[#17a8c0]/35 bg-white px-4 py-3.5 text-left'
                >
                  <div className='grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px]' style={{ background: 'linear-gradient(155deg,#7fd9e6,#17a8c0 62%,#0b7b8f)', boxShadow: '0 5px 10px -4px rgba(23,168,192,.6), inset 0 1px 0 rgba(255,255,255,.55)' }}>
                    <div className='relative grid h-3 w-3 place-items-center'>
                      <div className='absolute h-[2px] w-3 rounded-sm bg-white' />
                      <div className='absolute h-3 w-[2px] rounded-sm bg-white' />
                    </div>
                  </div>
                  <div className='min-w-0 flex-1'>
                    <div className='text-[13.5px] font-semibold text-ink'>{t('poolTitle', { amount: $(pool) })}</div>
                    <div className='mt-0.5 truncate text-xs text-[#8b969b]'>
                      {[
                        sources.carried > 0 && t('poolFromCarry', { amount: $(sources.carried, false), month: ymLabel(shiftYm(ym, -1), lang) }),
                        sources.freed > 0 && t('poolFromFreed', { amount: $(sources.freed, false) }),
                        sources.added > 0 && t('poolFromAdded', { amount: $(sources.added, false) }),
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div className='text-xs font-semibold text-[#0b7b8f]'>{t('distribute')}</div>
                </button>
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
                  {cats.map((c, i) => (
                    <button key={c.id} onClick={() => { tap('light'); setDetail(c.id); setScreen('detail'); }} className={CARD + ' anim-rise tap-soft flex w-full items-center gap-3 px-4 py-3.5 text-left'} style={{ animationDelay: Math.min(i, 6) * 40 + 'ms' }}>
                      <Tile cat={c} size={44} />
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-baseline justify-between gap-2.5'>
                          <div className='truncate text-sm font-semibold text-ink'>{c.name}</div>
                          <div className='shrink-0 font-mono text-[12.5px] text-ink'>{$(c.pot ? c.balance : c.cost)}</div>
                        </div>
                        {/* A pot has no monthly ceiling to fill, so a progress bar would be a lie. */}
                        {c.pot ? (
                          <>
                            {c.goal > 0 && (
                              <div className='my-2 h-1.5 overflow-hidden rounded-full bg-[#eceff0]'>
                                <div className='h-full rounded-full bar-fill' style={{ width: c.w + '%', background: c.full ? '#0b7b8f' : c.meta.bar }} />
                              </div>
                            )}
                            <div className={(c.goal > 0 ? '' : 'mt-1.5 ') + 'flex items-center justify-between gap-2.5'}>
                              <div className='text-[11.5px]' style={{ color: c.meta.color }}>{c.meta.text}</div>
                              <div className='font-mono text-[11.5px] text-[#8b969b]'>
                                {c.goal > 0 ? t('goalOf', { amount: $(c.goal, false) }) : t('balance')}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className='my-2 h-1.5 overflow-hidden rounded-full bg-[#eceff0]'>
                              <div className='h-full rounded-full bar-fill' style={{ width: c.w + '%', background: c.meta.bar }} />
                            </div>
                            <div className='flex items-center justify-between gap-2.5'>
                              <div className='text-[11.5px]' style={{ color: c.meta.color }}>{c.meta.text}</div>
                              <div className='font-mono text-[11.5px] text-[#8b969b]'>{c.target > 0 ? t('of') + ' ' + $(c.target, false) : ''}</div>
                            </div>
                          </>
                        )}
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
              <div className='mb-3 text-[13px] text-[#8b969b]'>{hits ? t('searchResults') : ymLabel(ym, lang)}</div>
              <div className='relative mb-2.5'>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  aria-label={t('searchPlaceholder')}
                  className='h-10 w-full rounded-xl border border-black/[0.07] bg-white pl-3.5 pr-16 text-[13px] text-ink outline-none'
                />
                {query !== '' && (
                  <button onClick={() => { tap('back'); setQuery(''); }} className='absolute right-1.5 top-1.5 flex h-7 items-center rounded-lg bg-black/[0.06] px-2.5 text-[11px] font-semibold text-[#5b6a70]'>{t('clearSearch')}</button>
                )}
              </div>
              {/* The split filters only mean anything within one month. */}
              {!hits && sharing && (
                <div className='flex gap-[7px]'>
                  {([['all', t('allActivity')], ['mine', t('justMe')], ['split', t('split5050')]] as const).map(([k, label]) => (
                    <button key={k} onClick={() => setFilter(k as 'all' | 'mine' | 'split')} className={'flex h-8 items-center rounded-full border border-black/[0.09] px-3.5 text-[12.5px] font-semibold ' + chip(filter === k)}>{label}</button>
                  ))}
                </div>
              )}
              <div className='mb-4 mt-2.5 font-mono text-[11.5px] text-[#8b969b]'>
                {nTx(filtered.length)} · {$(filtered.reduce((a, x) => a + x.amount, 0))}
              </div>
              {filtered.length === 0 ? <Empty title={t('noTx')} body={t('emptyBody')} /> : groupKeys.map((k) => (
                <div key={k} className='mb-[18px]'>
                  <div className='mx-1 mb-2 flex items-baseline justify-between'>
                    <div className='text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#8b969b]'>{hits ? dayLabel(k, lang) + ' · ' + ymLabel(k.slice(0, 7), lang) : dayLabel(k, lang)}</div>
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
                <button onClick={() => { tap('light'); setYm(shiftYm(ym, -1)); }} className='grid h-7 w-7 place-items-center rounded-full bg-white text-[#5b6a70] border border-black/[0.08]'>‹</button>
                <span className='text-[13px] font-semibold text-ink'>{ymLabel(ym, lang)}</span>
                <button onClick={() => { tap('light'); setYm(shiftYm(ym, 1)); }} className='grid h-7 w-7 place-items-center rounded-full bg-white text-[#5b6a70] border border-black/[0.08]'>›</button>
                <span className='ml-auto text-[11px] text-[#8b969b]'>{t('perMonth')}</span>
              </div>
              {!l.months[ym] && ceiling > 0 && (
                <div className='mb-4 rounded-[16px] border border-black/[0.06] bg-white px-3.5 py-3 text-[11.5px] leading-relaxed text-[#8b969b]'>
                  {t('copiedFromPrev')}
                </div>
              )}

              <div className={CARD + ' rounded-[22px] p-[18px]'}>
                <div className={LABEL}>{t('monthlyCeiling')}</div>
                <div className='my-3 flex items-center gap-2 rounded-2xl bg-canvas px-4 py-3'>
                  <span className='font-mono text-[24px] text-[#8b969b]'>€</span>
                  <input
                    value={ceilDraft ?? fromCents(mb.ceiling)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^0-9.,]/g, '');
                      setCeilDraft(raw);
                      const v = toCents(raw);
                      update((d) => { ensureMonth(d, ym).ceiling = v; });
                    }}
                    onBlur={() => setCeilDraft(null)}
                    inputMode='decimal'
                    placeholder='0'
                    aria-label={t('monthlyCeiling')}
                    className='w-full bg-transparent font-mono text-[28px] tracking-[-0.03em] text-ink outline-none'
                  />
                </div>
                {ceiling > 0 && (
                  <>
                    <div className='mb-2 mt-4 h-2 overflow-hidden rounded-full bg-[#eceff0]'>
                      <div className='h-full' style={{ width: Math.min(100, (alloc / ceiling) * 100) + '%', background: alloc > ceiling ? '#d8365b' : alloc < ceiling ? '#c8722a' : '#0b7b8f' }} />
                    </div>
                    {/* The plan and what was added to it stay separate, so the ceiling
                        keeps meaning "the most I want to spend". */}
                    {distributed(l, ym) > 0 && (
                      <div className='mb-2 flex justify-between font-mono text-[11.5px]'>
                        <span className='text-[#0b7b8f]'>{t('extraInMonth', { amount: $(distributed(l, ym), false) })}</span>
                        <span className='text-[#8b969b]'>{t('extraOrigin')}</span>
                      </div>
                    )}
                    <div className='flex justify-between font-mono text-[11.5px]'>
                      <span className='text-[#8b969b]'>{$(alloc, false)} {t('allocated')}</span>
                      <span style={{ color: alloc > ceiling ? '#d8365b' : alloc < ceiling ? '#c8722a' : '#0b7b8f' }}>
                        {alloc === ceiling ? t('fullyAllocated') : alloc > ceiling ? $(alloc - ceiling, false) + ' ' + t('overCeiling') : $(ceiling - alloc, false) + ' ' + t('unallocated')}
                      </span>
                    </div>
                  </>
                )}
              </div>

              <button onClick={() => { tap('light'); setBring(''); setSheet('add'); }} className='mt-2.5 flex w-full items-center gap-3 rounded-[18px] border border-black/[0.07] bg-white px-4 py-3.5 text-left'>
                <div className='relative grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px] bg-canvas'>
                  <div className='absolute h-[2px] w-3.5 rounded-sm bg-[#5b6a70]' />
                  <div className='absolute h-3.5 w-[2px] rounded-sm bg-[#5b6a70]' />
                </div>
                <div className='min-w-0 flex-1'>
                  <div className='text-[13px] font-semibold text-ink'>{t('addMoney')}</div>
                  <div className='mt-0.5 text-[11.5px] leading-snug text-[#8b969b]'>{t('addMoneyBody')}</div>
                </div>
              </button>

              <div className='mb-3 mt-6 text-[13px] font-bold text-ink'>{t('categoryTargets')}</div>
              <div className='flex flex-col gap-[9px]'>
                {realCats.map((c) => (
                  <div key={c.id} className={CARD + ' px-4 py-3.5'}>
                    <button onClick={() => openCatForm(c)} className='flex w-full items-center gap-3 text-left'>
                      <Tile cat={c} size={34} />
                      <div className='min-w-0 flex-1'>
                        <div className='truncate text-[13.5px] font-semibold text-ink'>{c.name}</div>
                        <div className='mt-[3px] text-[11px] text-[#8b969b]'>{kindLabel(c.kind)}{ceiling > 0 && c.target > 0 ? ' · ' + Math.round((c.target / ceiling) * 100) + '%' : ''}</div>
                      </div>
                      <div className='shrink-0 font-mono text-[15px] text-ink'>{$(c.target, false)}</div>
                    </button>
                    <input
                      type='range' min={0} max={Math.max(ceiling || 200000, c.target)} step={500} value={c.target}
                      onChange={(e) => { const v = parseInt(e.target.value, 10); update((d) => { ensureMonth(d, ym).targets[c.id] = v; }); }}
                      className='mt-3 w-full' style={{ accentColor: c.c }}
                    />
                    <div className='mt-0.5 flex justify-between font-mono text-[10.5px] text-[#b3bcbf]'>
                      <span>0</span><span>{c.pot ? t('potBalanceLabel') + ' ' + $(c.balance) : t('spent') + ' ' + $(c.spent)}</span><span>{$(Math.max(ceiling || 200000, c.target), false)}</span>
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
                {!detCat.virtual && (
                  <button onClick={() => openCatForm(detCat)} className='flex h-[34px] items-center rounded-full border border-black/[0.08] bg-white px-3.5 text-[12.5px] font-semibold text-[#0b7b8f]'>{t('editCategory')}</button>
                )}
              </div>
              <div className='mb-[22px] flex items-center gap-[15px]'>
                <Tile cat={detCat} size={54} />
                <div>
                  <div className='text-[21px] font-bold tracking-[-0.01em] text-ink'>{detCat.name}</div>
                  <div className='mt-[5px] text-[12.5px] text-[#8b969b]'>{detCat.virtual ? '' : kindLabel(detCat.kind) + ' · '}{nTx(detTx.length)}</div>
                </div>
              </div>
              <div className={CARD + ' rounded-[22px] p-[18px]'}>
                <div className='flex items-end justify-between'>
                  <div>
                    <div className={LABEL}>{detCat.pot ? t('potBalanceLabel') : t('spent')}</div>
                    <div className='mt-1.5 font-mono text-[28px] tracking-[-0.03em] text-ink'>{$(detCat.pot ? detCat.balance : detCat.cost)}</div>
                  </div>
                  {!detCat.virtual && (
                    <div className='text-right'>
                      <div className={LABEL}>{detCat.pot ? (detCat.goal > 0 ? t('goalLabel') : t('perMonthAmount')) : t('left')}</div>
                      <div className='mt-1.5 font-mono text-[17px]' style={{ color: detCat.meta.color }}>
                        {detCat.pot ? (detCat.goal > 0 ? $(detCat.goal, false) : '+' + $(detCat.target)) : $(detCat.target - detCat.cost)}
                      </div>
                    </div>
                  )}
                </div>
                {!detCat.virtual && (!detCat.pot || detCat.goal > 0) && (
                  <div className='relative my-4 h-2.5 overflow-hidden rounded-full bg-[#eceff0]'>
                    <div className='h-full rounded-full bar-fill' style={{ width: detCat.w + '%', background: detCat.full ? '#0b7b8f' : detCat.meta.bar }} />
                  </div>
                )}
                <div className={(detCat.virtual || (detCat.pot && detCat.goal <= 0) ? 'mt-3.5 ' : '') + 'text-xs leading-relaxed text-[#5b6a70]'}>
                  {detCat.meta.text}
                  {detCat.toGoal !== null && ' · ' + (detCat.toGoal === 1 ? t('oneMonthToGoal') : t('monthsToGoal', { n: detCat.toGoal }))}
                </div>
              </div>
              {detCat.pot ? (
                <button
                  onClick={() => openLog(detCat.id)}
                  disabled={detCat.balance <= 0}
                  className='my-3 flex h-[46px] w-full items-center justify-center rounded-2xl text-[13.5px] font-semibold text-white transition-colors'
                  style={{ background: detCat.balance > 0 ? '#12303a' : 'rgba(22,36,42,.22)' }}
                >
                  {detCat.balance > 0 ? t('takeFromPotBtn') : t('potEmpty')}
                </button>
              ) : !detCat.virtual ? (
                <button onClick={() => go('budget')} className='my-3 flex h-[46px] w-full items-center justify-center rounded-2xl bg-deep text-[13.5px] font-semibold text-white'>{t('adjustTarget')}</button>
              ) : null}
              {catMonths.some((h) => h.value !== 0) && (
                <div className={CARD + ' mt-3 rounded-[22px] px-[18px] pb-3.5 pt-[18px]'}>
                  <div className='flex items-baseline justify-between'>
                    <div className={LABEL}>{t('lastMonths', { n: catMonths.length })}</div>
                    {trend && <div className='text-[11.5px] font-medium' style={{ color: trend.color }}>{trend.text}</div>}
                  </div>
                  <div className='mt-3.5 flex h-[62px] items-end gap-1.5'>
                    {catMonths.map((h, i) => {
                      const peak = Math.max(...catMonths.map((x) => Math.abs(x.value)), 1);
                      const last = i === catMonths.length - 1;
                      return (
                        <div key={h.ym} className='flex flex-1 flex-col items-center gap-1.5'>
                          <div className='flex w-full flex-1 items-end'>
                            <div
                              className='w-full rounded-[4px] bar-fill'
                              style={{ height: Math.max(2, (Math.abs(h.value) / peak) * 46) + 'px', background: last ? detCat.c : '#dfe4e6' }}
                            />
                          </div>
                          <div className='font-mono text-[9.5px]' style={{ color: last ? '#16242a' : '#b3bcbf' }}>{monthInitial(h.ym)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className='mb-2.5 mt-6 text-[13px] font-bold text-ink'>{t('txHeading')}</div>
              <div className={CARD + ' overflow-hidden'}>{detTx.map((x) => <Row key={x.id} tx={x} showTile={false} />)}</div>
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
                    <button key={k} onClick={() => { tap('light'); update((d) => { d.lang = k; }); }} className={'h-[46px] flex-1 rounded-2xl text-[14px] font-semibold ' + (lang === k ? 'bg-deep text-white' : 'bg-canvas text-[#5b6a70]')}>{k === 'en' ? 'English' : 'Português'}</button>
                  ))}
                </div>
                <div className={LABEL + ' mt-5'}>{t('sharingLabel')}</div>
                <div className='mt-2.5 flex items-center gap-3'>
                  <div className='flex-1 text-[12px] leading-snug text-[#8b969b]'>{t('sharingBody')}</div>
                  <button
                    onClick={() => { const v = !sharing; tap('light'); update((d) => { d.splits = v; }); }}
                    aria-pressed={sharing}
                    className='relative h-[32px] w-[56px] shrink-0 rounded-full transition-colors'
                    style={{ background: sharing ? '#12303a' : '#dfe4e6' }}
                  >
                    <span className='absolute top-[3px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_4px_rgba(22,36,42,.2)] transition-[left] duration-200 ease-out' style={{ left: sharing ? '27px' : '3px' }} />
                  </button>
                </div>
                <div className={LABEL + ' mt-5'}>{t('feedback')}</div>
                <div className='mt-2.5 flex items-center gap-3'>
                  <div className='flex-1 text-[12px] leading-snug text-[#8b969b]'>{t('feedbackBody')}</div>
                  <button
                    onClick={() => { const v = !fb; setFeedback(v); setFb(v); if (v) tap('confirm'); }}
                    className='relative h-[32px] w-[56px] shrink-0 rounded-full transition-colors'
                    style={{ background: fb ? '#12303a' : '#dfe4e6' }}
                  >
                    <span className='absolute top-[3px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_4px_rgba(22,36,42,.2)] transition-[left] duration-200 ease-out' style={{ left: fb ? '27px' : '3px' }} />
                  </button>
                </div>
              </div>

              {sharing && <div className='mt-2.5 rounded-[22px] bg-deep p-[18px] text-white'>
                <div className='flex items-end justify-between'>
                  <div>
                    <div className='text-[9.5px] font-semibold uppercase tracking-[0.11em] text-white/50'>{t('unsettledTitle')}</div>
                    <div className='mt-[7px] font-mono text-[26px] tracking-[-0.03em]'>{$(unsettled(l, ym))}</div>
                  </div>
                  <div className='max-w-[140px] text-right text-[11.5px] text-white/55'>{t('unsettledBody')}</div>
                </div>
              </div>}

              <div className={LABEL + ' mb-2.5 mt-6'}>{t('onThisDevice')}</div>
              <div className={CARD + ' rounded-[22px] p-[18px]'}>
                <div className='text-[12.5px] leading-relaxed text-[#5b6a70]'>{t('deviceBody')}</div>
                <div className='mt-3.5 flex flex-col gap-2'>
                  {([
                    [storage.persisted, storage.persisted ? t('storagePersisted') : t('storageBestEffort')],
                    [storage.standalone, storage.standalone ? t('installedAs') : t('notInstalled')],
                  ] as const).map(([ok, label], i) => (
                    <div key={i} className='flex items-center gap-2.5'>
                      <span className='grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full' style={{ background: ok ? '#0b7b8f' : '#dfe4e6' }}>
                        {ok ? <span className='-mt-px block h-[3.5px] w-[7px] -rotate-45 border-b-2 border-l-2 border-white' /> : <span className='block h-[7px] w-[2px] rounded-sm bg-[#8b969b]' />}
                      </span>
                      <span className='text-[12.5px] font-medium' style={{ color: ok ? '#16242a' : '#8b969b' }}>{label}</span>
                    </div>
                  ))}
                  {storage.usedKb !== null && (
                    <div className='ml-[28px] font-mono text-[11px] text-[#b3bcbf]'>{t('storageUsed', { n: storage.usedKb })}</div>
                  )}
                </div>

                {!storage.standalone && (
                  <div className='mt-4 rounded-[16px] bg-canvas p-3.5'>
                    <div className='text-[12.5px] font-semibold text-ink'>{t('installTitle')}</div>
                    <div className='mt-1 text-[11.5px] leading-relaxed text-[#8b969b]'>{installer ? t('installAndroid') : t('installIos')}</div>
                    {installer && (
                      <button
                        onClick={async () => { tap('light'); try { await installer.prompt(); } catch {} setInstaller(null); }}
                        className='mt-2.5 h-[40px] w-full rounded-[13px] bg-deep text-[13px] font-semibold text-white'
                      >
                        {t('installNow')}
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className={LABEL + ' mb-2.5 mt-6'}>{t('backupTitle')}</div>
              <div className={CARD + ' rounded-[22px] p-[18px]'}>
                <div className='font-mono text-[11.5px]' style={{ color: l.lastExport ? '#0b7b8f' : '#c8722a' }}>
                  {l.lastExport ? t('lastExport', { when: dayLabel(l.lastExport.slice(0, 10), lang) }) : t('neverExported')}
                </div>
                <button onClick={doExport} className='mt-3 flex h-[50px] w-full items-center justify-center gap-2.5 rounded-[16px] bg-deep text-[14px] font-semibold text-white'>
                  <span className='grid h-[20px] w-[20px] place-items-center rounded-[7px] bg-[#7fd9e6]'>
                    <span className='block h-[8px] w-[8px] rotate-45 border-b-2 border-r-2 border-deep' />
                  </span>
                  {t('exportBtn')}
                </button>
                <div className='mt-2 flex gap-2'>
                  <button onClick={() => { tap('light'); fileInput.current?.click(); }} className='h-[46px] flex-1 rounded-[15px] border border-black/[0.07] bg-white text-[13px] font-semibold text-ink'>{t('importBtn')}</button>
                  <button onClick={doCopy} className='h-[46px] flex-1 rounded-[15px] border border-black/[0.07] bg-white text-[13px] font-semibold text-ink'>{t('copyBtn')}</button>
                </div>
                <input
                  ref={fileInput}
                  type='file'
                  accept='application/json,.json'
                  hidden
                  onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ''; doPickImport(f); }}
                />
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
          <div className='anim-toast absolute bottom-[100px] left-4 right-4 z-30 flex items-center gap-3 rounded-2xl bg-deep px-4 py-3.5 shadow-[0_14px_28px_-14px_rgba(18,48,58,.8)]'>
            <div className='grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#7fd9e6]'>
              <div className='-mt-0.5 h-1 w-2 -rotate-45 border-b-2 border-l-2 border-deep' />
            </div>
            <div className='flex-1 text-[13px] font-medium text-white'>{toast}</div>
          </div>
        )}

        {sheet === 'log' && (
          <>
            <div className={SCRIM} onClick={closeSheet} />
            <div role='dialog' aria-modal='true' aria-label={draft.id ? t('editExpense') : draftCat?.pot ? t('takeFromPotBtn') : t('newExpense')} className={SHEET + ' flex max-h-[96%] flex-col pt-2.5'}>
              <div className='shrink-0 px-[18px]'>
                <div className='mx-auto mb-3 mt-0.5 h-1 w-[38px] rounded-full bg-black/15' />
                <div className='flex items-center justify-between'>
                  <div className='text-[17px] font-bold text-ink'>{draft.id ? t('editExpense') : draftCat?.pot ? t('takeFromPotBtn') : t('newExpense')}</div>
                  <button onClick={closeSheet} aria-label={t('close')} className='grid h-[30px] w-[30px] place-items-center rounded-full bg-black/[0.06] text-[#5b6a70]'>✕</button>
                </div>
                <div className='relative pb-0.5 pt-2'>
                  <div key={draft.amount} className='anim-bump text-center font-mono text-[38px] leading-none tracking-[-0.04em]' style={{ color: draft.amount === '' ? '#c3cbce' : '#16242a' }}>€{draft.amount === '' ? '0' : draft.amount}</div>
                  {draft.amount !== '' && (
                    <button onClick={() => { tap('back'); setDraft((d) => ({ ...d, amount: '' })); }} className='absolute right-0 top-1 flex h-7 items-center rounded-full bg-black/[0.06] px-3 text-[11px] font-semibold text-[#5b6a70]'>{t('clearAmount')}</button>
                  )}
                  {impact && (
                    <div className='mt-2 text-center text-[11.5px] font-medium' style={{ color: impact.over ? '#d8365b' : '#8b969b' }}>{impact.text}</div>
                  )}
                </div>
              </div>

              <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px] pt-1'>
                <div className={LABEL + ' mb-2 mt-2'}>{t('catLabel')}</div>
                <div className='-mx-[18px] flex gap-2.5 overflow-x-auto px-[18px] pb-1'>
                  {realCats.map((c) => {
                    const on = draft.cat === c.id;
                    return (
                      <button key={c.id} onClick={() => { tap('light'); setDraft((d) => ({ ...d, cat: c.id })); }} aria-pressed={on} className='flex w-[68px] shrink-0 flex-col items-center gap-[7px] pt-1'>
                        <span className='relative block rounded-[16px]' style={{ boxShadow: on ? '0 0 0 2.5px #12303a' : 'none' }}>
                          <Tile cat={c} size={52} />
                          {on && (
                            <span className='absolute -right-1 -top-1 grid h-[18px] w-[18px] place-items-center rounded-full border-2 border-canvas bg-deep'>
                              <span className='-mt-px block h-[3.5px] w-[7px] -rotate-45 border-b-2 border-l-2 border-[#7fd9e6]' />
                            </span>
                          )}
                        </span>
                        <span className='w-full truncate text-center text-[9.5px] font-semibold leading-tight' style={{ color: on ? '#16242a' : '#8b969b' }}>{c.name}</span>
                      </button>
                    );
                  })}
                </div>

                <div className={LABEL + ' mb-2 mt-3'}>{t('dateLabel')}</div>
                <div className='flex gap-2'>
                  {[0, 1].map((off) => {
                    const dd = new Date(); dd.setDate(dd.getDate() - off);
                    const v = iso(dd);
                    return <button key={off} onClick={() => { tap('light'); setDraft((x) => ({ ...x, date: v })); }} className={'flex h-10 items-center rounded-xl border border-black/[0.07] px-3.5 text-[12.5px] font-semibold ' + chip(draft.date === v)}>{off === 0 ? t('today') : t('yesterday')}</button>;
                  })}
                  <input type='date' value={draft.date} max={iso(new Date())} onChange={(e) => { if (e.target.value) setDraft((d) => ({ ...d, date: e.target.value })); }} className='h-10 flex-1 rounded-xl border border-black/[0.07] bg-white px-2.5 font-mono text-[12.5px] text-ink outline-none' />
                </div>

                {sharing && <div className={LABEL + ' mb-2 mt-3'}>{t('splitLabel')}</div>}
                {sharing && <div className='flex gap-2'>
                  {([['mine', t('justMe')], ['half', t('split5050')], ['custom', t('customPct')]] as const).map(([k, label]) => {
                    const on = k === 'mine' ? draft.scope === 'mine' : k === 'half' ? draft.scope === 'split' && draft.pct === 50 : draft.scope === 'split' && draft.pct !== 50;
                    return <button key={k} onClick={() => { tap('light'); setDraft((d) => (k === 'mine' ? { ...d, scope: 'mine' } : { ...d, scope: 'split', pct: k === 'half' ? 50 : d.pct === 50 ? 60 : d.pct })); }} className={'h-10 flex-1 rounded-xl border border-black/[0.07] text-[12.5px] font-semibold ' + chip(on)}>{label}</button>;
                  })}
                </div>}
                {sharing && draft.scope === 'split' && (
                  <div className='mt-2 flex items-center gap-3 rounded-2xl border border-black/[0.06] bg-white p-3'>
                    <button onClick={() => { tap('light'); setDraft((d) => ({ ...d, pct: Math.max(0, d.pct - 5) })); }} aria-label='−5%' className='grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-canvas'>
                      <div className='h-[2.5px] w-2.5 rounded-sm bg-ink' />
                    </button>
                    <div className='flex-1 text-center'>
                      <div className='font-mono text-[13px] text-ink'>{t('you')} {draft.pct}% · {t('partner')} {100 - draft.pct}%</div>
                      <div className='mt-1.5 text-[10.5px] text-[#8b969b]'>{$(draftShare)} {t('countsAgainst')}</div>
                    </div>
                    <button onClick={() => { tap('light'); setDraft((d) => ({ ...d, pct: Math.min(100, d.pct + 5) })); }} aria-label='+5%' className='relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-canvas'>
                      <div className='absolute h-[2.5px] w-2.5 rounded-sm bg-ink' />
                      <div className='absolute h-2.5 w-[2.5px] rounded-sm bg-ink' />
                    </button>
                  </div>
                )}

                <div className={LABEL + ' mb-2 mt-3'}>{t('noteLabel')}</div>
                <input value={draft.note} onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))} placeholder={draftCat ? draftCat.name : t('note')} className='mb-1 h-11 w-full rounded-xl border border-black/[0.07] bg-white px-3.5 text-[13.5px] text-ink outline-none' />
              </div>

              <div className='shrink-0 border-t border-black/[0.06] bg-canvas px-[18px] pt-3' style={{ paddingBottom: 'calc(18px + env(safe-area-inset-bottom))' }}>
                <div className='grid grid-cols-3 gap-1.5'>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'].map((k) => (
                    <button key={k} onClick={() => { tap(k === 'del' ? 'back' : 'key'); pressKey(k); }} aria-label={k === 'del' ? 'Delete' : k} className='tap-key grid h-[46px] select-none place-items-center rounded-[15px] bg-white font-mono text-[21px] text-ink shadow-[0_1px_2px_rgba(22,36,42,.06)] active:bg-[#e9eef0]'>{k === 'del' ? '⌫' : k}</button>
                  ))}
                </div>
                <button onClick={saveTx} disabled={amountValue <= 0} className='mt-2.5 flex h-[54px] w-full items-center justify-center gap-2.5 rounded-[18px] text-[15px] font-bold text-white transition-colors' style={{ background: amountValue > 0 ? '#12303a' : 'rgba(22,36,42,.22)' }}>
                  {amountValue > 0 && (
                    <span className='grid h-[22px] w-[22px] place-items-center rounded-full bg-[#7fd9e6]'>
                      <span className='-mt-0.5 block h-1 w-2 -rotate-45 border-b-2 border-l-2 border-deep' />
                    </span>
                  )}
                  {amountValue > 0 ? (draft.id ? t('saveChanges') : draftCat?.pot ? t('takeAction') : t('confirmExpense')) + ' · ' + $(draftCents) : t('enterAmount')}
                </button>
              </div>
            </div>
          </>
        )}

        {sheet === 'tx' && (() => {
          const x = l.tx.find((r) => r.id === viewTx);
          if (!x) return null;
          const c = byId[x.cat] || byId[UNCAT_ID];
          return (
            <>
              <div className={SCRIM} onClick={closeSheet} />
              <div role='dialog' aria-modal='true' className={SHEET + ' px-[18px] pt-2.5'} style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
                <div className='mx-auto mb-[18px] mt-0.5 h-1 w-[38px] rounded-full bg-black/15' />
                <div className='mb-5 flex items-center gap-3.5'>
                  {c && <Tile cat={c} size={46} />}
                  <div className='flex-1'>
                    <div className='text-[17px] font-bold text-ink'>{x.note}</div>
                    <div className='mt-1 text-[12.5px] text-[#8b969b]'>{(c ? c.name : '') + ' · ' + dayLabel(x.date, lang) + ' · ' + (x.scope === 'split' ? x.pct + '/' + (100 - x.pct) : t('justMe'))}</div>
                  </div>
                  <div className='font-mono text-2xl tracking-[-0.02em] text-ink'>{$(x.amount)}</div>
                </div>
                {armDelete && <div className='mb-2.5 text-center text-[12px] font-semibold text-[#d8365b]'>{t('tapAgainToDelete')}</div>}
                {!armDelete && l.cats.length > 0 && (
                  <button onClick={() => openEdit(x)} className='mb-2.5 flex h-[50px] w-full items-center justify-center gap-2 rounded-[17px] bg-deep text-sm font-semibold text-white'>
                    <span className='grid h-[18px] w-[18px] place-items-center rounded-[6px] bg-[#7fd9e6]'>
                      <span className='block h-[9px] w-[2px] rotate-45 rounded-sm bg-deep' />
                    </span>
                    {t('edit')}
                  </button>
                )}
                <div className='flex gap-2.5'>
                  <button onClick={armDelete ? () => { tap('light'); setArmDelete(false); } : closeSheet} className='h-[50px] flex-1 rounded-[17px] border border-black/[0.06] bg-white text-sm font-semibold text-ink'>{armDelete ? t('cancel') : t('close')}</button>
                  <button
                    onClick={() => {
                      if (!armDelete) { tap('light'); setArmDelete(true); return; }
                      tap('back');
                      update((d) => { d.tx = d.tx.filter((r) => r.id !== x.id); });
                      setSheet(null);
                      setToast(t('deleted'));
                    }}
                    className='h-[50px] flex-1 rounded-[17px] text-sm font-semibold text-white transition-colors'
                    style={{ background: armDelete ? '#d8365b' : '#ec6a86' }}
                  >
                    {t('deleteTx')}
                  </button>
                </div>
              </div>
            </>
          );
        })()}

        {sheet === 'cat' && (
          <>
            <div className={SCRIM} onClick={closeSheet} />
            <div role='dialog' aria-modal='true' className={SHEET + ' max-h-full overflow-y-auto px-[18px] pt-2.5'} style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
              <div className='mx-auto mb-3.5 mt-0.5 h-1 w-[38px] rounded-full bg-black/15' />
              <div className='mb-4 flex items-center justify-between'>
                <div className='text-[17px] font-bold text-ink'>{form.id ? t('editCategory') : t('newCategory')}</div>
                <button onClick={closeSheet} aria-label={t('close')} className='grid h-[30px] w-[30px] place-items-center rounded-full bg-black/[0.06] text-[#5b6a70]'>✕</button>
              </div>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t('name')} className='mb-2.5 h-[46px] w-full rounded-2xl bg-white px-3.5 text-[14.5px] font-medium text-ink outline-none' />
              <div className='mb-2.5 flex gap-2.5'>
                <div className='flex h-[46px] flex-1 items-center gap-1 rounded-2xl bg-white px-3.5'>
                  <span className='font-mono text-[14px] text-[#8b969b]'>€</span>
                  <input value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value.replace(/[^0-9.,]/g, '') })} inputMode='decimal' placeholder={form.kind === 'saving' ? t('perMonthAmount') : t('target')} aria-label={form.kind === 'saving' ? t('perMonthAmount') : t('target')} className='w-full bg-transparent font-mono text-[14.5px] text-ink outline-none' />
                </div>
                {/* A goal only means something for a pot, so it only appears for one. */}
                {form.kind === 'saving' && (
                  <div className='flex h-[46px] flex-1 items-center gap-1 rounded-2xl bg-white px-3.5'>
                    <span className='font-mono text-[14px] text-[#8b969b]'>€</span>
                    <input value={form.goal} onChange={(e) => setForm({ ...form, goal: e.target.value.replace(/[^0-9.,]/g, '') })} inputMode='decimal' placeholder={t('goalOptional')} aria-label={t('goalLabel')} className='w-full bg-transparent font-mono text-[14.5px] text-ink outline-none' />
                  </div>
                )}
              </div>
              <div className='flex gap-2'>
                {([['variable', t('variable')], ['fixed', t('fixed')], ['saving', t('saving')]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => { tap('light'); setForm({ ...form, kind: k as Kind }); }} className={'h-[46px] flex-1 rounded-2xl text-[13px] font-semibold ' + chip(form.kind === k)}>{label}</button>
                ))}
              </div>
              {/* One line, only for what is selected: the three kinds are the one
                  thing in here a newcomer cannot guess. */}
              <div className='mb-3.5 mt-2 px-1 text-[11.5px] leading-relaxed text-[#8b969b]'>
                {form.kind === 'variable' ? t('kindVariableHelp') : form.kind === 'fixed' ? t('kindFixedHelp') : t('kindSavingHelp')}
              </div>
              <div className='mb-2 flex gap-2.5'>
                {PALETTE.map((p, i) => (
                  <button key={i} onClick={() => { tap('light'); setForm({ ...form, ci: i }); }} aria-label={'Cor ' + (i + 1)} aria-pressed={form.ci === i} className='h-10 flex-1 rounded-[13px]' style={{ background: 'linear-gradient(155deg,' + p.cl + ',' + p.c + ' 60%,' + p.cd + ')', boxShadow: form.ci === i ? '0 0 0 3px #12303a' : 'inset 0 1px 0 rgba(255,255,255,.5)' }} />
                ))}
              </div>
              <div className='mb-[18px] flex gap-2.5'>
                {MARKS.map((mk) => (
                  <button
                    key={mk}
                    onClick={() => { tap('light'); setForm({ ...form, mark: mk }); }}
                    aria-label={mk}
                    aria-pressed={form.mark === mk}
                    className='grid h-10 flex-1 place-items-center rounded-[13px]'
                    style={{ boxShadow: form.mark === mk ? '0 0 0 2.5px #12303a' : 'none', opacity: form.mark === mk ? 1 : 0.5 }}
                  >
                    {/* The real tile, so the row previews exactly what you will get. */}
                    <Tile cat={{ id: mk, name: mk, kind: form.kind, mark: mk, ...PALETTE[form.ci] }} size={30} />
                  </button>
                ))}
              </div>
              {!catDel && (
                <button onClick={saveCat} disabled={!form.name.trim()} className='h-[54px] w-full rounded-[18px] text-[15px] font-bold text-white transition-colors' style={{ background: form.name.trim() ? '#12303a' : 'rgba(22,36,42,.22)' }}>
                  {form.id ? t('saveChanges') : t('create')}
                </button>
              )}
              {form.id && !catDel && (
                <button onClick={askDeleteCat} className='mt-2.5 h-[46px] w-full rounded-[16px] text-[13.5px] font-semibold text-[#d8365b]'>{t('deleteCategory')}</button>
              )}

              {catDel && (
                <div className='anim-pop rounded-[20px] border border-[#ec6a86]/35 bg-white p-4'>
                  {catDel.count > 0 ? (
                    <>
                      <div className='text-[13.5px] font-semibold text-ink'>{catDel.count === 1 ? t('catInUseOne') : t('catInUseTitle', { n: catDel.count })}</div>
                      <div className='mt-1 text-[12px] text-[#8b969b]'>{t('catInUseBody')}</div>
                      <div className='mt-3 flex flex-col gap-2'>
                        {catDel.dest && (
                          <label className='flex items-center gap-2.5 rounded-xl bg-canvas px-3 py-2.5'>
                            <input type='radio' name='catdel' checked={catDel.mode === 'move'} onChange={() => setCatDel({ ...catDel, mode: 'move' })} style={{ accentColor: '#12303a' }} />
                            <span className='shrink-0 text-[12.5px] font-semibold text-ink'>{t('moveThemTo')}</span>
                            <select
                              value={catDel.dest}
                              onChange={(e) => setCatDel({ ...catDel, mode: 'move', dest: e.target.value })}
                              className='ml-auto min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 text-[12.5px] font-semibold text-ink outline-none'
                            >
                              {realCats.filter((c) => c.id !== form.id).map((c) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label className='flex items-center gap-2.5 rounded-xl bg-canvas px-3 py-2.5'>
                          <input type='radio' name='catdel' checked={catDel.mode === 'uncat'} onChange={() => setCatDel({ ...catDel, mode: 'uncat' })} style={{ accentColor: '#12303a' }} />
                          <span className='text-[12.5px] font-semibold text-ink'>{t('keepUncategorised')}</span>
                        </label>
                        <label className='flex items-center gap-2.5 rounded-xl bg-canvas px-3 py-2.5'>
                          <input type='radio' name='catdel' checked={catDel.mode === 'purge'} onChange={() => setCatDel({ ...catDel, mode: 'purge' })} style={{ accentColor: '#d8365b' }} />
                          <span className='text-[12.5px] font-semibold text-[#d8365b]'>{t('deleteThemToo')}</span>
                        </label>
                      </div>
                    </>
                  ) : (
                    <div className='text-[13.5px] font-semibold text-ink'>{t('confirmCatDelete')}</div>
                  )}
                  <div className='mt-3.5 flex gap-2.5'>
                    <button onClick={() => { tap('light'); setCatDel(null); }} className='h-[46px] flex-1 rounded-[15px] border border-black/[0.07] bg-white text-[13.5px] font-semibold text-ink'>{t('cancel')}</button>
                    <button onClick={deleteCat} className='h-[46px] flex-1 rounded-[15px] bg-[#d8365b] text-[13.5px] font-semibold text-white'>{t('confirmCatDelete')}</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {sheet === 'add' && (
          <>
            <div className={SCRIM} onClick={closeSheet} />
            <div role='dialog' aria-modal='true' className={SHEET + ' px-[18px] pt-2.5'} style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
              <div className='mx-auto mb-3.5 mt-0.5 h-1 w-[38px] rounded-full bg-black/15' />
              <div className='text-[17px] font-bold text-ink'>{t('addMoney')}</div>
              <div className='mt-1.5 text-[12.5px] leading-relaxed text-[#8b969b]'>{t('addMoneyBody')}</div>
              <div className='my-4 flex items-center gap-2 rounded-2xl bg-white px-4 py-3'>
                <span className='font-mono text-[24px] text-[#8b969b]'>€</span>
                <input
                  value={bring}
                  onChange={(e) => setBring(e.target.value.replace(/[^0-9.,]/g, ''))}
                  inputMode='decimal'
                  placeholder='0'
                  autoFocus
                  aria-label={t('addMoneyAmount')}
                  className='w-full bg-transparent font-mono text-[28px] tracking-[-0.03em] text-ink outline-none'
                />
              </div>
              <div className='flex gap-2.5'>
                <button onClick={closeSheet} className='h-[50px] flex-1 rounded-[17px] border border-black/[0.06] bg-white text-sm font-semibold text-ink'>{t('cancel')}</button>
                <button onClick={saveBring} disabled={toCents(bring) <= 0} className='h-[50px] flex-1 rounded-[17px] text-sm font-semibold text-white transition-colors' style={{ background: toCents(bring) > 0 ? '#12303a' : 'rgba(22,36,42,.22)' }}>
                  {t('distribute')}
                </button>
              </div>
            </div>
          </>
        )}

        {sheet === 'pool' && (
          <>
            <div className={SCRIM} onClick={closeSheet} />
            <div role='dialog' aria-modal='true' aria-label={t('distribute')} className={SHEET + ' flex max-h-[94%] flex-col px-[18px] pt-2.5'} style={{ paddingBottom: 'calc(18px + env(safe-area-inset-bottom))' }}>
              <div className='mx-auto mb-3 mt-0.5 h-1 w-[38px] shrink-0 rounded-full bg-black/15' />
              <div className='shrink-0'>
                <div className='flex items-baseline justify-between'>
                  <div className='text-[17px] font-bold text-ink'>{t('distribute')}</div>
                  <div key={left} className='anim-bump font-mono text-[26px] tracking-[-0.03em]' style={{ color: left === 0 ? '#0b7b8f' : '#16242a' }}>{$(left)}</div>
                </div>
                <div className='mt-0.5 flex items-baseline justify-between'>
                  <div className='text-[11.5px] text-[#8b969b]'>{t('giveAll')}</div>
                  <div className='text-[11px] text-[#8b969b]'>{t('stillToPlace')}</div>
                </div>
              </div>

              <div className='-mx-[18px] mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain px-[18px]'>
                {/* Only real categories. Money parked on the month at large would
                    raise the ceiling without sitting in any budget, so it could
                    never be spent or carried and would quietly evaporate.
                    Undecided money belongs in the pool, which never expires. */}
                {realCats.map((c) => ({ key: c.id, name: c.name, cat: c })).map((row) => {
                  const amount = give[row.key] || 0;
                  return (
                    <div key={row.key} className='flex items-center gap-2.5 border-t border-black/[0.06] py-2.5 first:border-t-0'>
                      <Tile cat={row.cat} size={30} />
                      <div className='min-w-0 flex-1 truncate text-[13px] font-semibold text-ink'>{row.name}</div>
                      <button onClick={() => { tap('key'); bump(row.key, -step); }} disabled={amount <= 0} aria-label='−' className='grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white' style={{ opacity: amount > 0 ? 1 : 0.35 }}>
                        <div className='h-[2.5px] w-2.5 rounded-sm bg-ink' />
                      </button>
                      <button onClick={() => { tap('light'); giveEverything(row.key); }} className='min-w-[62px] shrink-0 text-center font-mono text-[13px]' style={{ color: amount > 0 ? '#0b7b8f' : '#b3bcbf' }}>
                        {amount > 0 ? $(amount, false) : '—'}
                      </button>
                      <button onClick={() => { tap('key'); bump(row.key, step); }} disabled={left <= 0} aria-label='+' className='relative grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-white' style={{ opacity: left > 0 ? 1 : 0.35 }}>
                        <div className='absolute h-[2.5px] w-2.5 rounded-sm bg-ink' />
                        <div className='absolute h-2.5 w-[2.5px] rounded-sm bg-ink' />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className='shrink-0 pt-3'>
                {given > 0 && (
                  <button onClick={() => { tap('back'); setGive({}); }} className='mb-2 h-[38px] w-full rounded-[14px] text-[12.5px] font-semibold text-[#5b6a70]'>{t('undoAll')}</button>
                )}
                <button onClick={saveGive} disabled={given <= 0} className='h-[54px] w-full rounded-[18px] text-[15px] font-bold text-white transition-colors' style={{ background: given > 0 ? '#12303a' : 'rgba(22,36,42,.22)' }}>
                  {given > 0 ? t('doneDistributing') + ' · ' + $(given) : t('doneDistributing')}
                </button>
              </div>
            </div>
          </>
        )}

        {sheet === 'import' && incoming && (
          <>
            <div className={SCRIM} onClick={closeSheet} />
            <div role='dialog' aria-modal='true' className={SHEET + ' px-[18px] pt-2.5'} style={{ paddingBottom: 'calc(24px + env(safe-area-inset-bottom))' }}>
              <div className='mx-auto mb-3.5 mt-0.5 h-1 w-[38px] rounded-full bg-black/15' />
              <div className='text-[17px] font-bold text-ink'>{t('importTitle')}</div>
              <div className='mt-1.5 text-[12.5px] leading-relaxed text-[#8b969b]'>{t('importBody')}</div>
              <div className='mt-4 rounded-[18px] border border-black/[0.06] bg-white p-4'>
                <div className='text-[14px] font-semibold text-ink'>{incoming.summary.workspace || '—'}</div>
                <div className='mt-1.5 font-mono text-[12px] text-[#5b6a70]'>
                  {[
                    incoming.summary.cats + ' ' + t(incoming.summary.cats === 1 ? 'unitCat' : 'unitCats'),
                    incoming.summary.tx + ' ' + t(incoming.summary.tx === 1 ? 'unitTx' : 'unitTxs'),
                    incoming.summary.months + ' ' + t(incoming.summary.months === 1 ? 'unitMonth' : 'unitMonths'),
                  ].join(' · ')}
                </div>
                {incoming.summary.from && incoming.summary.to && (
                  <div className='mt-1 font-mono text-[11.5px] text-[#8b969b]'>
                    {t('importRange', { from: incoming.summary.from, to: incoming.summary.to })}
                  </div>
                )}
              </div>
              <div className='mt-4 flex gap-2.5'>
                <button onClick={() => { tap('light'); setIncoming(null); setSheet(null); }} className='h-[50px] flex-1 rounded-[17px] border border-black/[0.06] bg-white text-sm font-semibold text-ink'>{t('cancel')}</button>
                <button onClick={doImport} className='h-[50px] flex-1 rounded-[17px] bg-[#d8365b] text-sm font-semibold text-white'>{t('restore')}</button>
              </div>
            </div>
          </>
        )}

        <nav className='absolute inset-x-0 bottom-0 z-10 flex h-[82px] items-start border-t border-black/[0.07] bg-white/95 px-2 pt-2.5 backdrop-blur-xl' style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
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
          <button onClick={() => openLog()} aria-label={t('newExpense')} className='absolute left-1/2 top-[-16px] grid h-[58px] w-[58px] -translate-x-1/2 place-items-center rounded-[22px]' style={{ background: 'linear-gradient(155deg,#7fd9e6,#17a8c0 58%,#0b7b8f)', boxShadow: '0 12px 22px -8px rgba(11,123,143,.75), inset 0 1px 0 rgba(255,255,255,.5)' }}>
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

'use client';

import { useState } from 'react';
import { PALETTE, STARTERS, makeCategory, ymNow } from '@/lib/data';
import { makeT } from '@/lib/i18n';
import { money } from '@/lib/format';
import type { Lang, Ledger } from '@/lib/types';
import { Tile } from './Icons';

export default function Onboarding({ update }: { update: (fn: (d: Ledger) => void) => void }) {
  const [step, setStep] = useState(0);
  const [lang, setLang] = useState<Lang>('en');
  const [name, setName] = useState('');
  const [ceiling, setCeiling] = useState('');
  const [picked, setPicked] = useState<string[]>(['bills', 'grocery', 'dining']);
  const [targets, setTargets] = useState<Record<string, string>>({});
  const t = makeT(lang);

  const ceilingCents = Math.round((parseFloat(ceiling.replace(',', '.')) || 0) * 100);
  const chosen = STARTERS.filter((s) => picked.includes(s.key));

  const finish = () => {
    // Keep the icon that was on screen when they picked it.
    const cats = chosen.map((s, i) => makeCategory(lang === 'pt' ? s.pt : s.en, s.kind, s.ci, i, s.mark));
    const tg: Record<string, number> = {};
    cats.forEach((c, i) => {
      const raw = targets[chosen[i].key];
      tg[c.id] = Math.round((parseFloat((raw || '').replace(',', '.')) || 0) * 100);
    });
    update((d) => {
      d.lang = lang;
      d.workspace = name.trim() || (lang === 'pt' ? 'O meu dinheiro' : 'My money');
      d.cats = cats;
      d.months[ymNow()] = { ceiling: ceilingCents, targets: tg };
      d.onboarded = true;
    });
  };

  const canNext = step === 0 ? true : step === 1 ? ceilingCents > 0 : step === 2 ? chosen.length > 0 : true;
  const field = 'h-[52px] w-full rounded-2xl bg-white px-4 text-[15px] text-ink outline-none border border-black/[0.06]';

  return (
    <main className='mx-auto flex min-h-screen max-w-[430px] flex-col bg-canvas px-[22px] pb-8 pt-14'>
      <div className='mb-8 flex gap-1.5'>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className='h-1 flex-1 rounded-full' style={{ background: i <= step ? '#12303a' : 'rgba(22,36,42,.12)' }} />
        ))}
      </div>

      {step === 0 && (
        <div className='flex-1'>
          <h1 className='text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink'>{t('setupWelcome')}</h1>
          <div className='mb-2.5 mt-8 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b969b]'>{t('setupLang')}</div>
          <div className='mb-7 flex gap-2.5'>
            {(['en', 'pt'] as Lang[]).map((k) => (
              <button key={k} onClick={() => setLang(k)} className={'h-[52px] flex-1 rounded-2xl text-[15px] font-semibold ' + (lang === k ? 'bg-deep text-white' : 'bg-white text-[#5b6a70] border border-black/[0.06]')}>
                {k === 'en' ? 'English' : 'Português'}
              </button>
            ))}
          </div>
          <div className='mb-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b969b]'>{t('setupName')}</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('setupNamePh')} className={field} />
        </div>
      )}

      {step === 1 && (
        <div className='flex-1'>
          <h1 className='text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink'>{t('setupCeiling')}</h1>
          <p className='mt-3 text-[14px] leading-relaxed text-[#5b6a70]'>{t('setupCeilingHelp')}</p>
          <div className='mt-8 flex items-center gap-2 rounded-[22px] border border-black/[0.06] bg-white px-5 py-6'>
            <span className='font-mono text-[32px] text-[#8b969b]'>€</span>
            <input
              value={ceiling}
              onChange={(e) => setCeiling(e.target.value.replace(/[^0-9.,]/g, ''))}
              inputMode='decimal'
              placeholder='0'
              autoFocus
              className='w-full bg-transparent font-mono text-[38px] tracking-[-0.03em] text-ink outline-none'
            />
          </div>
        </div>
      )}

      {step === 2 && (
        <div className='flex-1'>
          <h1 className='text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink'>{t('setupCats')}</h1>
          <p className='mb-6 mt-3 text-[14px] leading-relaxed text-[#5b6a70]'>{t('setupCatsHelp')}</p>
          <div className='grid grid-cols-2 gap-2.5'>
            {STARTERS.map((s) => {
              const on = picked.includes(s.key);
              const p = PALETTE[s.ci];
              return (
                <button
                  key={s.key}
                  onClick={() => setPicked((v) => (on ? v.filter((x) => x !== s.key) : [...v, s.key]))}
                  className={'flex items-center gap-2.5 rounded-[18px] border p-3 text-left ' + (on ? 'border-deep bg-white' : 'border-black/[0.06] bg-white/60')}
                  style={{ opacity: on ? 1 : 0.55 }}
                >
                  <Tile cat={{ id: s.key, name: s.key, kind: s.kind, mark: s.mark, ...p }} size={34} />
                  <span className='text-[12.5px] font-semibold leading-tight text-ink'>{lang === 'pt' ? s.pt : s.en}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className='flex-1'>
          <h1 className='text-[28px] font-bold leading-tight tracking-[-0.02em] text-ink'>{t('setupTargets')}</h1>
          <p className='mb-6 mt-3 text-[14px] leading-relaxed text-[#5b6a70]'>{t('setupTargetsHelp')}</p>
          <div className='flex flex-col gap-2.5'>
            {chosen.map((s) => (
              <div key={s.key} className='flex items-center gap-3 rounded-[18px] border border-black/[0.06] bg-white p-3'>
                <Tile cat={{ id: s.key, name: s.key, kind: s.kind, mark: s.mark, ...PALETTE[s.ci] }} size={34} />
                <div className='flex-1 text-[13.5px] font-semibold text-ink'>{lang === 'pt' ? s.pt : s.en}</div>
                <div className='flex items-center gap-1'>
                  <span className='font-mono text-[15px] text-[#8b969b]'>€</span>
                  <input
                    value={targets[s.key] || ''}
                    onChange={(e) => setTargets((v) => ({ ...v, [s.key]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                    inputMode='decimal'
                    placeholder='0'
                    className='w-[74px] rounded-lg bg-canvas px-2 py-1.5 text-right font-mono text-[15px] text-ink outline-none'
                  />
                </div>
              </div>
            ))}
          </div>
          <div className='mt-4 text-center font-mono text-[12px] text-[#8b969b]'>
            {money(Object.values(targets).reduce((a, v) => a + Math.round((parseFloat((v || '').replace(',', '.')) || 0) * 100), 0), false, lang)} / {money(ceilingCents, false, lang)}
          </div>
        </div>
      )}

      <div className='mt-8 flex gap-2.5'>
        {step > 0 && (
          <button onClick={() => setStep(step - 1)} className='h-[54px] flex-1 rounded-[18px] bg-white text-[15px] font-semibold text-ink border border-black/[0.06]'>{t('back')}</button>
        )}
        <button
          onClick={() => (step === 3 ? finish() : setStep(step + 1))}
          disabled={!canNext}
          className='h-[54px] flex-[2] rounded-[18px] text-[15px] font-bold text-white'
          style={{ background: canNext ? '#12303a' : 'rgba(22,36,42,.22)' }}
        >
          {step === 3 ? t('finish') : t('next')}
        </button>
      </div>
    </main>
  );
}

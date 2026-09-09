import type { Category, MarkKind } from '@/lib/types';

const W = 'rgba(255,255,255,.96)';

export function Mark({ kind, size }: { kind: MarkKind; size: number }) {
  const s = Math.round(size * 0.44);
  const t = Math.max(2, size * 0.09);
  switch (kind) {
    case 'bar':
      return (
        <div className='flex flex-col items-start' style={{ gap: Math.max(2, size * 0.07) }}>
          <div style={{ width: s, height: t * 0.85, borderRadius: 9, background: W }} />
          <div style={{ width: s * 0.62, height: t * 0.85, borderRadius: 9, background: 'rgba(255,255,255,.62)' }} />
        </div>
      );
    case 'circle':
      return <div style={{ width: s * 0.78, height: s * 0.78, borderRadius: '50%', background: W }} />;
    case 'ring':
      return <div style={{ width: s * 0.86, height: s * 0.86, borderRadius: '50%', border: t + 'px solid ' + W }} />;
    case 'diamond':
      return <div style={{ width: s * 0.66, height: s * 0.66, borderRadius: 2, background: W, transform: 'rotate(45deg)' }} />;
    case 'stack':
      return (
        <div className='flex items-end' style={{ gap: Math.max(2, size * 0.06) }}>
          {[0.5, 0.75, 1].map((h, i) => (
            <div key={i} style={{ width: t, height: s * h, borderRadius: 9, background: i === 2 ? W : 'rgba(255,255,255,.7)' }} />
          ))}
        </div>
      );
    case 'dot':
      return (
        <div className='grid place-items-center' style={{ width: s * 0.9, height: s * 0.9, borderRadius: '50%', border: t * 0.8 + 'px solid rgba(255,255,255,.55)' }}>
          <div style={{ width: s * 0.32, height: s * 0.32, borderRadius: '50%', background: W }} />
        </div>
      );
    case 'plus':
      return (
        <div className='relative grid place-items-center' style={{ width: s, height: s }}>
          <div className='absolute' style={{ width: s, height: t, borderRadius: 9, background: W }} />
          <div className='absolute' style={{ width: t, height: s, borderRadius: 9, background: W }} />
        </div>
      );
    default:
      return <div style={{ width: s * 0.8, height: s * 0.8, borderRadius: Math.max(2, size * 0.12), border: t + 'px solid ' + W }} />;
  }
}

/** Clay tile. Swap the inner <Mark /> for a real 3D icon asset when you have one. */
export function Tile({ cat, size = 44 }: { cat: Category; size?: number }) {
  return (
    <div
      className='grid shrink-0 place-items-center'
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        background: 'linear-gradient(155deg,' + cat.cl + ' 0%,' + cat.c + ' 60%,' + cat.cd + ' 100%)',
        boxShadow:
          '0 ' + (size * 0.14).toFixed(1) + 'px ' + (size * 0.28).toFixed(1) + 'px -' + (size * 0.13).toFixed(1) + 'px ' + cat.c + 'aa, inset 0 1px 0 rgba(255,255,255,.6), inset 0 -' + (size * 0.08).toFixed(1) + 'px ' + (size * 0.15).toFixed(1) + 'px rgba(0,0,0,.14)',
      }}
    >
      <Mark kind={cat.mark} size={size} />
    </div>
  );
}

export function TabIcon({ kind, on }: { kind: 'home' | 'activity' | 'budget' | 'me'; on: boolean }) {
  const col = on ? '#12303a' : '#a8b2b6';
  if (kind === 'home')
    return (
      <div className='flex h-5 items-end gap-[3px]'>
        {[10, 16, 13].map((h, i) => (
          <div key={i} style={{ width: 4, height: h, borderRadius: 2, background: col, opacity: i === 1 ? 1 : 0.55 }} />
        ))}
      </div>
    );
  if (kind === 'activity')
    return (
      <div className='flex h-5 w-5 flex-col justify-center gap-1'>
        {[1, 0.7, 0.85].map((w, i) => (
          <div key={i} style={{ width: 18 * w, height: 3, borderRadius: 2, background: col, opacity: i === 0 ? 1 : 0.5 }} />
        ))}
      </div>
    );
  if (kind === 'budget')
    return (
      <div
        style={{
          width: 20, height: 20, borderRadius: '50%',
          border: '3px solid ' + col,
          borderRightColor: on ? 'rgba(18,48,58,.25)' : 'rgba(168,178,182,.35)',
          transform: 'rotate(-40deg)',
        }}
      />
    );
  return <div style={{ width: 18, height: 18, borderRadius: '50%', border: '3px solid ' + col }} />;
}

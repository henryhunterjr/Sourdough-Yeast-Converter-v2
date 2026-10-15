import type { YeastKind } from '@bgb/dough-core';
import type { Strings } from '../i18n';

export interface Options {
  prefermentedFlour: number;          // 0.10 .. 0.40
  levainHydration: 'auto' | 'liquid' | 'stiff';
  yeastPct: number;                   // 0.003 .. 0.02
  yeastKind: YeastKind;
}

export const DEFAULT_OPTIONS: Options = { prefermentedFlour: 0.2, levainHydration: 'auto', yeastPct: 0.01, yeastKind: 'instant' };

export function OptionsSheet({ open, onClose, direction, opts, setOpts, s }: {
  open: boolean; onClose: () => void; direction: 'to-sourdough' | 'to-yeast';
  opts: Options; setOpts: (o: Options) => void; s: Strings;
}) {
  if (!open) return null;
  const step = (key: 'prefermentedFlour' | 'yeastPct', d: number, min: number, max: number) =>
    setOpts({ ...opts, [key]: Math.min(max, Math.max(min, Math.round((opts[key] + d) * 1000) / 1000)) });

  return (
    <>
      <div className="sheet-back" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="grab" />
        <h2>{s.options}</h2>
        {direction === 'to-sourdough' ? (
          <>
            <div className="row">
              <label>{s.prefermentedFlourOpt}<span className="hint">{s.prefermentedFlourHint}</span></label>
              <div className="stepper">
                <button onClick={() => step('prefermentedFlour', -0.05, 0.1, 0.4)} aria-label="less">−</button>
                <output>{Math.round(opts.prefermentedFlour * 100)}%</output>
                <button onClick={() => step('prefermentedFlour', 0.05, 0.1, 0.4)} aria-label="more">+</button>
              </div>
            </div>
            <div className="row">
              <label>{s.levainHydrationOpt}<span className="hint">{s.levainHint}</span></label>
            </div>
            <div className="seg block">
              {(['auto', 'liquid', 'stiff'] as const).map(v => (
                <button key={v} aria-pressed={opts.levainHydration === v} onClick={() => setOpts({ ...opts, levainHydration: v })}>
                  {v === 'auto' ? s.auto : v === 'liquid' ? s.liquid : s.stiff}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="row">
              <label>{s.yeastPctOpt}<span className="hint">{s.yeastPctHint}</span></label>
              <div className="stepper">
                <button onClick={() => step('yeastPct', -0.0025, 0.0025, 0.02)} aria-label="less">−</button>
                <output>{(opts.yeastPct * 100).toFixed(2).replace(/0$/, '')}%</output>
                <button onClick={() => step('yeastPct', 0.0025, 0.0025, 0.02)} aria-label="more">+</button>
              </div>
            </div>
            <div className="row"><label>{s.yeastKindOpt}</label></div>
            <div className="seg block">
              {(['instant', 'active-dry', 'fresh'] as const).map(v => (
                <button key={v} aria-pressed={opts.yeastKind === v} onClick={() => setOpts({ ...opts, yeastKind: v })}>
                  {v === 'instant' ? s.instant : v === 'active-dry' ? s.activeDry : s.fresh}
                </button>
              ))}
            </div>
          </>
        )}
        <div style={{ height: 16 }} />
        <button className="btn" onClick={onClose}>{s.done}</button>
      </div>
    </>
  );
}

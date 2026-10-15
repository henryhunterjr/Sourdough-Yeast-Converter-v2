import { useEffect, useMemo, useRef, useState } from 'react';
import { analyze, convertToSourdough, convertToYeast, detectLanguage, renderRecipe, sanityCheck, type Conversion, type Recipe } from '@bgb/dough-core';
import { readRecipe, type Flag, type ReadResult } from './api';
import { t, type Lang } from './i18n';
import { EXAMPLES } from './examples';
import { RecipeView } from './components/RecipeView';
import { OptionsSheet, DEFAULT_OPTIONS, type Options } from './components/OptionsSheet';

type Direction = 'to-sourdough' | 'to-yeast';

const KEY = 'syc:v2';
function loadDraft(): { text: string; hydration: number; lang: Lang | null } {
  try { const j = JSON.parse(localStorage.getItem(KEY) || ''); return { text: j.text ?? '', hydration: j.hydration ?? 100, lang: j.lang ?? null }; }
  catch { return { text: '', hydration: 100, lang: null }; }
}

export default function App() {
  const draft = useMemo(loadDraft, []);
  const [text, setText] = useState(draft.text);
  const [hydration, setHydration] = useState(draft.hydration);
  const [langChoice, setLangChoice] = useState<Lang | null>(draft.lang);
  const [dirChoice, setDirChoice] = useState<Direction | 'auto'>('auto');
  const [opts, setOpts] = useState<Options>(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [read, setRead] = useState<ReadResult | null>(null);
  const [tab, setTab] = useState<'converted' | 'original'>('converted');
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const lang: Lang = langChoice ?? (read?.recipe.language) ?? (text.trim() ? detectLanguage(text) : 'en');
  const s = t(lang);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ text, hydration, lang: langChoice })); } catch { /* private mode */ }
  }, [text, hydration, langChoice]);

  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(null), 1800); return () => clearTimeout(id); } }, [toast]);

  const original: Recipe | null = read?.recipe ?? null;
  const originalLeavening = original ? analyze(original).leavening : null;
  const direction: Direction = dirChoice !== 'auto' ? dirChoice : originalLeavening === 'sourdough' ? 'to-yeast' : 'to-sourdough';

  const checks = original ? sanityCheck(original) : [];
  const blocked = checks.some(c => c.level === 'error');

  const conversion: Conversion | null = useMemo(() => {
    if (!original || blocked) return null;
    try {
      return direction === 'to-sourdough'
        ? convertToSourdough(original, { prefermentedFlour: opts.prefermentedFlour, ...(opts.levainHydration === 'auto' ? {} : { levainHydration: opts.levainHydration }) })
        : convertToYeast(original, { yeastPct: opts.yeastPct, kind: opts.yeastKind });
    } catch { return null; }
  }, [original, blocked, direction, opts]);

  async function go() {
    if (!text.trim() || busy) return;
    abort.current?.abort();
    const ac = new AbortController(); abort.current = ac;
    setBusy(true); setRead(null); setTab('converted');
    try {
      const r = await readRecipe(text, hydration, ac.signal);
      if (!ac.signal.aborted) { setRead(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    } finally { if (!ac.signal.aborted) setBusy(false); }
  }

  function clear() { abort.current?.abort(); setRead(null); setText(''); setBusy(false); setDirChoice('auto'); }

  const outputText = () => {
    const r = tab === 'converted' && conversion ? conversion.recipe : original;
    return r ? renderRecipe(r) + `\n\n${s.appName} · bakinggreatbread.blog` : '';
  };
  async function copy() {
    try { await navigator.clipboard.writeText(outputText()); setToast(s.copied); } catch { /* ignore */ }
  }
  async function share() {
    const body = outputText();
    if (navigator.share) { try { await navigator.share({ title: original?.title ?? s.appName, text: body }); } catch { /* cancelled */ } }
    else copy();
  }

  const flags: Flag[] = [
    ...(read?.offline ? [{ level: 'info' as const, message: s.networkFail }] : []),
    ...(read?.flags ?? []).filter(f => !/^No AI reader configured/.test(f.message)),
    ...checks.map(c => ({ level: c.level, message: c.message })),
    ...(read?.uncertainties ?? []).map(u => ({ level: 'info' as const, message: u })),
    ...(conversion?.notes ?? []).map(n => ({ level: n.level, message: n.message })),
  ];
  const problems = flags.filter(f => f.level !== 'info');

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <img className="logo" src="/icon.svg" alt="" />
          <div><h1>{s.shortName}</h1><small>{s.tagline}</small></div>
        </div>
        <div className="seg" aria-label="Language">
          <button aria-pressed={lang === 'en'} onClick={() => setLangChoice('en')}>EN</button>
          <button aria-pressed={lang === 'es'} onClick={() => setLangChoice('es')}>ES</button>
        </div>
      </header>

      <main className="main">
        {!read && (
          <>
            <section className="card">
              <h2>{s.paste}</h2>
              <textarea className="paste" value={text} onChange={e => setText(e.target.value)} placeholder={s.pastePlaceholder} spellCheck={false} autoCapitalize="off" />
              {!text.trim() && (
                <div className="empty">
                  <p><b>{s.noRecipe}</b></p>
                  <p>{s.noRecipeHint}</p>
                  <div className="examples">
                    <button className="chip" onClick={() => setText(EXAMPLES.lean)}>{s.tryLean}</button>
                    <button className="chip" onClick={() => setText(EXAMPLES.enriched)}>{s.tryEnriched}</button>
                    <button className="chip" onClick={() => { setText(EXAMPLES.spanish); setLangChoice(null); }}>{s.trySpanish}</button>
                  </div>
                </div>
              )}
            </section>
            <section className="card">
              <div className="row">
                <label>{s.direction}</label>
                <div className="seg">
                  <button aria-pressed={dirChoice === 'auto'} onClick={() => setDirChoice('auto')}>{s.auto}</button>
                  <button aria-pressed={dirChoice === 'to-sourdough'} onClick={() => setDirChoice('to-sourdough')}>{s.toSourdough}</button>
                  <button aria-pressed={dirChoice === 'to-yeast'} onClick={() => setDirChoice('to-yeast')}>{s.toYeast}</button>
                </div>
              </div>
              <div className="row">
                <label>{s.starterHydration}<span className="hint">{s.starterHint}</span></label>
                <div className="stepper">
                  <button onClick={() => setHydration(h => Math.max(50, h - 10))} aria-label="less">−</button>
                  <output>{hydration}%</output>
                  <button onClick={() => setHydration(h => Math.min(150, h + 10))} aria-label="more">+</button>
                </div>
              </div>
            </section>
            <p className="fine">{s.footer}</p>
          </>
        )}

        {read && original && (
          <>
            <section className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className={`badge ${read.source === 'model' ? 'ok' : 'neutral'}`}>{read.source === 'model' ? s.readByModel : s.readByParser}</span>
                <span className={`badge ${problems.length ? 'warn' : 'ok'}`}>{problems.length ? `${s.checkThese} (${problems.length})` : s.allClear}</span>
              </div>
              {flags.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  {flags.map((f, i) => (
                    <div className={`flag ${f.level}`} key={i}><span className="dot" /><div>{f.where ? <b>{f.where.component}{f.where.ingredient ? ` · ${f.where.ingredient}` : ''}: </b> : null}{f.message}</div></div>
                  ))}
                </div>
              )}
              {blocked && <div className="flag error" style={{ marginTop: 8 }}><span className="dot" /><div>{s.sanityFail}</div></div>}
            </section>

            <div className="seg block" style={{ marginBottom: 10 }}>
              <button aria-pressed={tab === 'converted'} onClick={() => setTab('converted')}>{s.converted}</button>
              <button aria-pressed={tab === 'original'} onClick={() => setTab('original')}>{s.original}</button>
            </div>
            {tab === 'converted' && (
              <div className="seg block" style={{ marginBottom: 14 }}>
                <button aria-pressed={direction === 'to-sourdough'} onClick={() => setDirChoice('to-sourdough')}>{s.toSourdough}</button>
                <button aria-pressed={direction === 'to-yeast'} onClick={() => setDirChoice('to-yeast')}>{s.toYeast}</button>
              </div>
            )}

            <section className="card">
              {tab === 'converted' && conversion ? (
                <>
                  {original.title && <h3 style={{ fontSize: 20, marginBottom: 10 }}>{original.title}</h3>}
                  {conversion.levain && (
                    <div className="flag info" style={{ marginBottom: 12 }}><span className="dot" /><div>
                      <b>{s.levainBuild}:</b> {Math.round(conversion.levain.seed)}g starter + {Math.round(conversion.levain.flour)}g flour + {Math.round(conversion.levain.water)}g water = {Math.round(conversion.levain.total)}g ({conversion.levain.hydration}%, {conversion.levain.prefermentedFlourPct}% PFF)
                    </div></div>
                  )}
                  {conversion.yeast && (
                    <div className="flag info" style={{ marginBottom: 12 }}><span className="dot" /><div>
                      <b>{s.yeastAmount}:</b> {s.instant} {conversion.yeast.instant}g · {s.activeDry} {conversion.yeast.activeDry}g · {s.fresh} {conversion.yeast.fresh}g ({conversion.yeast.pct}%)
                    </div></div>
                  )}
                  <RecipeView recipe={conversion.recipe} s={s} highlightChanges />
                </>
              ) : (
                <>
                  {original.title && <h3 style={{ fontSize: 20, marginBottom: 10 }}>{original.title}</h3>}
                  <RecipeView recipe={original} s={s} />
                </>
              )}
            </section>
            <p className="fine">{s.footer}</p>
          </>
        )}
      </main>

      <div className="dock">
        <div className="inner">
          {!read ? (
            <>
              {text.trim() && <button className="btn secondary" onClick={clear}>{s.clear}</button>}
              <button className="btn" onClick={go} disabled={!text.trim() || busy}>
                {busy ? <><span className="spinner" />{s.reading}</> : s.convert}
              </button>
            </>
          ) : (
            <>
              <button className="btn secondary" onClick={clear}>{s.clear}</button>
              <button className="btn secondary" onClick={() => setSheet(true)}>{s.options}</button>
              <button className="btn secondary" onClick={copy}>{s.copy}</button>
              <button className="btn primary-wide" onClick={share}>{s.share}</button>
            </>
          )}
        </div>
      </div>

      {read && (
        <OptionsSheet open={sheet} onClose={() => setSheet(false)} direction={direction} opts={opts} setOpts={setOpts} s={s} />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

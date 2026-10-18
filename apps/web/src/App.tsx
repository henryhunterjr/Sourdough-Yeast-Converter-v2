import { useEffect, useMemo, useRef, useState } from 'react';
import { analyze, convertToSourdough, convertToYeast, detectLanguage, renderRecipe, sanityCheck, type Conversion, type Recipe } from '@bgb/dough-core';
import { readRecipe, type Flag, type ReadResult } from './api';
import { prepareFile, type ImageInput, type Prepared } from './input';
import { t, type Lang } from './i18n';
import { EXAMPLES } from './examples';
import { RecipeView } from './components/RecipeView';
import { OptionsSheet, DEFAULT_OPTIONS, type Options } from './components/OptionsSheet';
import { Icon } from './components/Icon';
import { AdaptationNotice, adaptationText } from './components/AdaptationNotice';
import { conversionSafety } from './conversionSafety';

declare const __APP_VERSION__: string;
declare const __BUILD_ID__: string;

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
  const [preparing, setPreparing] = useState(false);
  const [images, setImages] = useState<ImageInput[]>([]);
  const [document, setDocument] = useState<Prepared['document']>();
  const [importError, setImportError] = useState<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [read, setRead] = useState<ReadResult | null>(null);
  const [tab, setTab] = useState<'converted' | 'original'>('converted');
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const lang: Lang = langChoice ?? (read?.recipe.language) ?? (text.trim() ? detectLanguage(text) : 'en');
  const s = t(lang);

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const shared = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n');
    if (shared.trim()) { setText(shared); history.replaceState(null, '', '/'); }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ text, hydration, lang: langChoice })); } catch { /* private mode */ }
  }, [text, hydration, langChoice]);

  useEffect(() => { if (toast) { const id = setTimeout(() => setToast(null), 1800); return () => clearTimeout(id); } }, [toast]);

  const original: Recipe | null = read?.recipe ?? null;
  const originalLeavening = original && original.components.length ? analyze(original).leavening : null;
  const direction: Direction = dirChoice !== 'auto' ? dirChoice : originalLeavening === 'sourdough' ? 'to-yeast' : 'to-sourdough';

  const checks = original && original.components.length ? sanityCheck(original) : [];
  const blocked = checks.some(c => c.level === 'error');

  const conversion: Conversion | null = useMemo(() => {
    if (!original || !original.components.length || blocked) return null;
    try {
      return direction === 'to-sourdough'
        ? convertToSourdough(original, { prefermentedFlour: opts.prefermentedFlour, ...(opts.levainHydration === 'auto' ? {} : { levainHydration: opts.levainHydration }) })
        : convertToYeast(original, { yeastPct: opts.yeastPct, kind: opts.yeastKind });
    } catch { return null; }
  }, [original, blocked, direction, opts]);

  const safetyIssues = conversion && tab === 'converted' ? conversionSafety(conversion.recipe, direction) : [];
  const canExport = !!(read?.recipe?.components.length && (tab === 'original' || (!!conversion && safetyIssues.length === 0)));
  const canGo = !!text.trim() || images.length > 0;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (cameraRef.current) cameraRef.current.value = '';
    if (fileRef.current) fileRef.current.value = '';
    const pdf = selected.some(f => f.type === 'application/pdf' || /\.pdf$/i.test(f.name));
    if (pdf && selected.length > 1) { setImportError(s.onePdf); return; }
    if (pdf && canGo && !window.confirm(s.replacePdf)) return;
    setImportError(null);
    setPreparing(true);
    try {
      if (selected.length > 12) throw new Error(s.tooManyImages);
      const prepared: Prepared[] = [];
      for (const file of selected) prepared.push(await prepareFile(file));
      const nextImages = [...(pdf ? [] : images), ...prepared.flatMap(p => p.images ?? [])];
      if (nextImages.length > 12 || nextImages.reduce((n, im) => n + im.data.length, 0) > 4_000_000) throw new Error(s.tooManyImages);
      const newText = prepared.flatMap(p => p.text ? [p.text] : []).join('\n\n');
      if (pdf) { setText(newText); setImages(nextImages); setDocument(prepared[0]?.document); }
      else { if (newText) setText(t => [t, newText].filter(Boolean).join('\n\n')); setImages(nextImages); }
    } catch (e) { setImportError((e as Error).message); }
    finally { setPreparing(false); if (cameraRef.current) cameraRef.current.value = ''; if (fileRef.current) fileRef.current.value = ''; }
  }

  async function go() {
    if (!canGo || busy) return;
    abort.current?.abort();
    const ac = new AbortController(); abort.current = ac;
    setBusy(true); setRead(null); setTab('converted');
    try {
      const r = await readRecipe({ text, images: images.map(i => ({ data: i.data, mediaType: i.mediaType })) }, hydration, ac.signal);
      if (!ac.signal.aborted) { setRead(r); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    } catch (e) { if ((e as Error).name !== 'AbortError') setToast((e as Error).message); }
    finally { if (!ac.signal.aborted) setBusy(false); }
  }

  function clear() { abort.current?.abort(); setRead(null); setText(''); setImages([]); setDocument(undefined); setImportError(null); setBusy(false); setDirChoice('auto'); }
  function editRecipe() {
    abort.current?.abort(); setRead(null); setBusy(false); setSheet(false);
    requestAnimationFrame(() => { textRef.current?.focus(); window.scrollTo({ top: 0, behavior: 'instant' }); });
  }

  function printRecipe(saveAsPdf = false) {
    if (!canExport) { setToast(s.unsafeExport); return; }
    if (saveAsPdf) setToast(s.savePdfHint);
    window.print();
  }

  const outputText = () => {
    const r = tab === 'converted' && conversion ? conversion.recipe : original;
    const notice = tab === 'converted' && conversion && original ? `\n\n${adaptationText(original, s)}` : '';
    return r ? renderRecipe(r) + notice + `\n\n${s.appName} · bakinggreatbread.blog` : '';
  };
  async function copy() {
    if (!canExport) { setToast(s.unsafeExport); return; }
    try { await navigator.clipboard.writeText(outputText()); setToast(s.copied); } catch { /* ignore */ }
  }
  async function share() {
    if (!canExport) { setToast(s.unsafeExport); return; }
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
    <div className="app" lang={lang}>
      <a className="skip-link" href="#workspace">{s.paste}</a>
      <header className="topbar">
        <div className="brand">
          <picture>
            <source srcSet="/brand/academy-logo-360.webp" type="image/webp" />
            <img className="brand-logo" src="/brand/academy-logo-360.png" width="360" height="243" alt="" />
          </picture>
          <div className="brand-name">{s.academy}</div>
          <span className="brand-divider" />
          <span className="brand-tool">{s.shortName}</span>
        </div>
        <div className="header-utility">
          <span className="build-label" title={`Version ${__APP_VERSION__}, build ${__BUILD_ID__}`}>v{__APP_VERSION__} <span className="build-revision">· {__BUILD_ID__}</span></span>
          <div className="seg" aria-label="Language">
          <button aria-pressed={lang === 'en'} onClick={() => setLangChoice('en')}>EN</button>
          <button aria-pressed={lang === 'es'} onClick={() => setLangChoice('es')}>ES</button>
          </div>
        </div>
      </header>

      <main id="workspace" tabIndex={-1} className={`main ${read ? 'results-layout' : 'input-layout'}`}>
        <section className="intro">
          <p className="tool-name"><Icon name="swap" />{s.toolName}</p>
          <h1>{read ? s.resultTitle : s.heroTitle}</h1>
          <p className="intro-copy">{read ? s.resultIntro : s.heroIntro}</p>
          {read && <nav className="return-nav" aria-label={s.backToStart}>
            <button className="btn secondary" onClick={editRecipe}>{s.editRecipe}</button><p>{s.draftKept}</p>
          </nav>}
          {!read && <div className="intro-note"><span className="check-seal"><Icon name="check" /></span><p>{s.heroDetail}</p></div>}
        </section>
        {!read && (
          <>
            <section className="card recipe-input" aria-busy={busy || preparing}>
              <div className="card-heading"><h2><label htmlFor="recipe-text">{s.paste}</label></h2><span>{s.inputFormats}</span></div>
              <textarea ref={textRef} id="recipe-text" className="paste" aria-describedby="recipe-help" disabled={preparing} value={text} onChange={e => setText(e.target.value)} placeholder={s.pastePlaceholder} spellCheck={false} autoCapitalize="off" />
              <p id="recipe-help" className="input-help">{s.inputHelp}</p>
              <p className="input-help authored-alternate">{s.authoredAlternate}</p>
              {document && <p className="input-help">{document.name} · {document.pages} {s.pdfPages} · {document.mode === 'text' ? s.pdfText : s.pdfImages}</p>}
              {importError && <p className="flag error" role="alert">{importError}</p>}
              <div className="attach-row">
                <button className="btn secondary" onClick={() => cameraRef.current?.click()} disabled={preparing}><Icon name="camera" />{s.takePhoto}</button>
                <button className="btn secondary" onClick={() => fileRef.current?.click()} disabled={preparing}>{preparing ? <><span className="spinner" />{s.preparing}</> : <><Icon name="upload" />{s.upload}</>}</button>
                <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={e => addFiles(e.target.files)} />
                <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={e => addFiles(e.target.files)} />
              </div>
              {images.length > 0 && (
                <div className="thumbs">
                  {images.map((im, i) => (
                    <div className="thumb" key={i}><img src={im.preview} alt={im.name} /><button aria-label={s.remove} onClick={() => setImages(x => x.filter((_, j) => j !== i))}>×</button></div>
                  ))}
                </div>
              )}
              {!text.trim() && images.length === 0 && (
                <div className="empty">
                  <p>{s.startWithSample}</p>
                  <div className="examples">
                    <button className="chip" onClick={() => setText(EXAMPLES.lean)}>{s.tryLean}</button>
                    <button className="chip" onClick={() => setText(EXAMPLES.enriched)}>{s.tryEnriched}</button>
                    <button className="chip" onClick={() => { setText(lang === 'es' ? EXAMPLES.lean : EXAMPLES.spanish); setLangChoice(null); }}>{s.trySpanish}</button>
                  </div>
                </div>
              )}
              {busy && <div className="reading-state" role="status"><span className="spinner" /><div><b>{s.reading}</b><p>{s.readingHint}</p></div></div>}
            </section>
            <section className="card setup-card">
              <h2>{s.setupTitle}</h2>
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
                  <button onClick={() => setHydration(h => Math.max(50, h - 10))} aria-label={`${s.decrease} ${s.starterHydration}`}>−</button>
                  <output>{hydration}%</output>
                  <button onClick={() => setHydration(h => Math.min(150, h + 10))} aria-label={`${s.increase} ${s.starterHydration}`}>+</button>
                </div>
              </div>
            </section>
            <p className="fine">{s.footer}</p>
          </>
        )}

        {read && original && original.components.length === 0 && (
          <section className="card error-card" role="alert">
            <h2>{s.readErrorTitle}</h2><p className="error-hint">{s.readErrorHint}</p>
            {flags.map((f, i) => <div className={`flag ${f.level}`} key={i}><span className="dot" /><div>{f.message}</div></div>)}
            {read.transcript && (
              <details className="transcript"><summary>{s.transcript}</summary><p>{s.transcriptHint}</p><pre className="plain">{read.transcript}</pre></details>
            )}
          </section>
        )}

        {read && original && original.components.length > 0 && (
          <>
            <section className="card reader-status" aria-label={s.reading}>
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
              {read.transcript && (
                <details className="transcript"><summary>{s.transcript}</summary><p>{s.transcriptHint}</p><pre className="plain">{read.transcript}</pre></details>
              )}
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

            <div className="result-toolbar" role="group" aria-label={s.exportActions}>
              <button className="btn secondary" onClick={() => printRecipe()} disabled={!canExport}><Icon name="print" />{s.print}</button>
              <button className="btn secondary" onClick={() => printRecipe(true)} disabled={!canExport}><Icon name="download" />{s.savePdf}</button>
            </div>
            {tab === 'converted' && safetyIssues.length > 0 && <section className="card error-card export-warning" role="alert">
              <h2>{s.unsafeTitle}</h2>
              <p>{s.unsafeHint}</p>
              <ul>{safetyIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>
              <p>{s.unsafeExport}</p>
            </section>}
            <section className="card recipe-result" id="printable-recipe">
              <div className="print-heading">
                {/* Printed recipes and saved PDFs are Recipe Pantry products, so they carry its logo. */}
                <img className="print-logo" src="/brand/recipe-pantry-logo-480.png" width="480" height="481" alt="Recipe Pantry" loading="eager" />
                <span className="print-meta"><strong>{s.appName}</strong><span>recipepantry.app · v{__APP_VERSION__}</span></span>
              </div>
              {tab === 'converted' && conversion ? (
                <>
                  {original.title && <h2 className="recipe-title">{original.title}</h2>}
                  <AdaptationNotice original={original} s={s} />
                  {conversion.levain && (
                    <div className="flag info" style={{ marginBottom: 12 }}><span className="dot" /><div>
                      <b>{s.levainBuild}:</b> {Math.round(conversion.levain.seed)}g {s.levainStarter} + {Math.round(conversion.levain.flour)}g {s.levainFlour} + {Math.round(conversion.levain.water)}g {s.levainWater} = {Math.round(conversion.levain.total)}g ({conversion.levain.hydration}%, {conversion.levain.prefermentedFlourPct}% PFF)
                    </div></div>
                  )}
                  {conversion.yeast && (
                    <div className="flag info" style={{ marginBottom: 12 }}><span className="dot" /><div>
                      <b>{s.yeastAmount}:</b> {s.instant} {conversion.yeast.instant}g · {s.activeDry} {conversion.yeast.activeDry}g · {s.fresh} {conversion.yeast.fresh}g ({conversion.yeast.pct}%)
                    </div></div>
                  )}
                  <RecipeView recipe={conversion.recipe} s={s} highlightChanges showSteps={safetyIssues.length === 0} />
                </>
              ) : (
                <>
                  {original.title && <h2 className="recipe-title">{original.title}</h2>}
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
              <span className="dock-note">{s.readyHint}</span>
              {canGo && <button className="btn secondary" onClick={clear} disabled={preparing}>{s.clear}</button>}
              <button className="btn primary-wide" onClick={go} disabled={!canGo || busy || preparing}>
                {busy ? <><span className="spinner" />{s.reading}</> : <>{s.convert}<Icon name="arrow" /></>}
              </button>
            </>
          ) : (
            <>
              <button className="btn secondary" onClick={editRecipe} aria-label={s.backToStart}>{s.back}</button>
              {original && original.components.length > 0 && <>
              <button className="btn secondary" onClick={() => setSheet(true)}><Icon name="tune" />{s.options}</button>
              <button className="btn secondary" onClick={copy} disabled={!canExport}><Icon name="copy" />{s.copy}</button>
              <button className="btn primary-wide" onClick={share} disabled={!canExport}><Icon name="share" />{s.share}</button>
              </>}
            </>
          )}
        </div>
      </div>

      {read && (
        <OptionsSheet open={sheet} onClose={() => setSheet(false)} direction={direction} opts={opts} setOpts={setOpts} s={s} />
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

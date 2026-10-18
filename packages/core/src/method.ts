/**
 * Method editing. The baker's own steps stay; only leavening-specific
 * sentences are rewritten, and fermentation times are rescaled clause by
 * clause. Bake, shape, fill and cool text passes through untouched.
 */
import type { Step } from './model.js';
import { ROUND } from './units.js';

type Lang = 'en' | 'es';
type Richness = 'lean' | 'enriched' | 'sweet';

const T = {
  en: {
    buildLevain: (seed: number, flour: number, water: number, h: number) =>
      `Build the levain the night before: mix ${ROUND.grams(seed)}g active starter (${h}% hydration), ${ROUND.grams(flour)}g flour, and ${ROUND.grams(water)}g water. Cover and leave at 75 to 78°F (24 to 26°C) for 8 to 12 hours, until domed and about doubled.`,
    dissolveLevain: 'Tear the levain into pieces and dissolve it in the liquid before adding the flour; sourdough needs no proofing step.',
    skipLevain: (kind: string) => `This version uses ${kind}, which goes straight into the dry flour. No proofing step needed.`,
    adyNote: 'Dissolve the active dry yeast in a few tablespoons of the recipe\'s liquid, warmed to 105 to 110°F (40 to 43°C), and let it sit 5 minutes before mixing.',
    freshNote: 'Crumble the fresh yeast into the liquid and stir until it dissolves, then mix as written.',
    removedBuild: 'The levain build is no longer needed.',
    timeNote: 'Fermentation times are estimates. Go by the dough: it should look puffy and about 50% bigger before shaping, and springy but slow to fill a fingertip dent before baking.',
    levainWord: 'levain', allLevain: 'all of the levain', yeastWord: 'yeast',
    yeastKinds: { instant: 'instant yeast', 'active-dry': 'active dry yeast', fresh: 'fresh yeast' },
    addYeastAfterRest: (kind: string) => `After the rest, add the ${kind} (it can go in with the salt) and mix until it's evenly worked in. Bulk fermentation counts from here, not from the first mix.`,
  },
  es: {
    buildLevain: (seed: number, flour: number, water: number, h: number) =>
      `Prepara el levain la noche anterior: mezcla ${ROUND.grams(seed)}g de masa madre activa (${h}% de hidratación), ${ROUND.grams(flour)}g de harina y ${ROUND.grams(water)}g de agua. Tapa y deja a 24 a 26°C de 8 a 12 horas, hasta que esté abombado y casi duplicado.`,
    dissolveLevain: 'Trocea el levain y disuélvelo en el líquido antes de añadir la harina; la masa madre no necesita activarse.',
    skipLevain: (kind: string) => `Esta versión usa ${kind}, que va directa a la harina. No hace falta activarla.`,
    adyNote: 'Disuelve la levadura seca activa en unas cucharadas del líquido de la receta, tibio (40 a 43°C), y espera 5 minutos antes de mezclar.',
    freshNote: 'Desmenuza la levadura fresca en el líquido y remueve hasta disolverla, luego mezcla como indica la receta.',
    removedBuild: 'Ya no hace falta preparar el levain.',
    timeNote: 'Los tiempos de fermentación son estimados. Guíate por la masa: debe verse esponjosa y un 50% más grande antes de formar, y volver despacio al presionar antes de hornear.',
    levainWord: 'levain', allLevain: 'todo el levain', yeastWord: 'levadura',
    yeastKinds: { instant: 'levadura instantánea', 'active-dry': 'levadura seca activa', fresh: 'levadura fresca' },
    addYeastAfterRest: (kind: string) => `Después del reposo, añade la ${kind} (puede ir junto con la sal) y mezcla hasta integrarla bien. La fermentación en bloque cuenta desde aquí, no desde la primera mezcla.`,
  },
} as const;

const RISE_WORDS = /\b(rise|rises|rising|proof|proofs|proofing|ferment\w*|bulk|double|doubled|puffy|lev(?:a|e|ar|ado|ada|en)|leud\w*|duplic\w*|esponjos\w*)\b/i;
const BAKE_WORDS = /\b(bake|baking|oven|preheat|hornea|hornear|horno|precalienta)/i;
const COLD_WORDS = /\b(fridge|refrigerat|retard|overnight|cold|nevera|refrigera|frío|fria|toda la noche)/i;
const YEAST_PROOF = /\b(dissolve|proof|bloom|activate|foamy|sprinkle)\w*\b[^.]*\byeast\b|\byeast\b[^.]*\b(foamy|bubbl|dissolve|activate)|\b(disuelve|disolver|activa|activar|espum)\w*[^.]*\blevadura\b|\blevadura\b[^.]*\b(espum|disuel|activ)/i;
const YEAST_ADD = /\b(whisk|stir|mix|add|sprinkle|combine)\b[^.]*\byeast\b|\b(mezcla|añade|agrega|espolvorea|bate)\w*\b[^.]*\blevadura\b/i;
const YEAST_WAIT = /\b(let|allow)\b[^.]*\b(stand|sit|rest|proof)\b|\b(foamy|bubbly|bubbles|creamy)\b|\b(deja|dejar|reposa)\w*\b[^.]*\b(minutos|espum|burbuj)/i;
const LEVAIN_BUILD = /\b(build|feed|refresh|prepare|make)\b[^.]*\b(levain|starter)\b[^.]*\b(night|hours? (before|ahead)|overnight|doubled|double|ripe|peak|bubbly)\b|\b(prepara|alimenta|refresca)\b[^.]*\b(levain|masa madre)\b[^.]*\b(noche|horas antes|duplic|burbuj)/i;
/** A rest, autolyse or "rest X minutes" inside a mixing step. */
const REST_CLAUSE = /\b(autolyse|autolysis|aut[oó]lisis|rest|rests|resting|reposa\w*|reposo)\b/i;
/** Ways a step tells the baker to combine the starter with the liquid. */
const STARTER_REF = /(?:ripe |active |madura |activa )?(?:levain|sourdough starter|starter|masa madre)/i;
const BUILD_CONTINUES = /\b(cover|leave|let|sit|rest|until|doubled|domed|bubbly|ripe|peak|hours|tapa|deja|duplic|abombad|burbuj|horas)\b/i;
const YEAST_AMOUNT = /\b\d+(?:[.,]\d+)?\s*(?:g|grams?|tsp|teaspoons?|tbsp|tablespoons?|packets?|envelopes?|cucharaditas?|cucharadas?|sobres?)\s+(?:of\s+|de\s+)?(?:(?:instant|active dry|dry|fresh)\s+)?yeast\b|\b\d+(?:[.,]\d+)?\s*(?:g|gramos?)\s+(?:de\s+)?levadura(?:\s+(?:instantánea|seca|fresca|activa))?\b/gi;

/** Rise-time multipliers, yeast -> sourdough: [first rise, final proof]. */
const TO_SOURDOUGH: Record<Richness, [number, number]> = { lean: [3.5, 3], enriched: [4, 3], sweet: [4, 3] };
/**
 * Longest a rescaled rise may run at room temperature, in minutes. A brioche
 * with a 2-hour yeasted rise would otherwise read "rise 8 hours", past the
 * 4 to 7 hours the enriched-dough note promises; beyond this the baker
 * should retard in the fridge instead.
 */
const MAX_ROOM_TEMP_RISE: Record<Richness, [number, number]> = { lean: [8 * 60, 4 * 60], enriched: [7 * 60, 4 * 60], sweet: [7 * 60, 4 * 60] };

const TIME_UNIT = '(minutes?|mins?|hours?|hrs?|h|minutos?|horas?)';
const TIME_RE = new RegExp(`(\\d+(?:[.,]\\d+)?(?:\\s+\\d/\\d)?|an?|una?|half an)\\s*(?:(?:to|-|–|a|or|y)\\s*(\\d+(?:[.,]\\d+)?(?:\\s+\\d/\\d)?))?\\s*${TIME_UNIT}\\b(\\s+(?:and a half|y media))?`, 'gi');

function toMinutes(raw: string, isHours: boolean, andHalf: boolean): number {
  let n: number;
  if (/^(an?|una?)$/i.test(raw)) n = 1;
  else if (/^half an$/i.test(raw)) n = 0.5;
  else {
    const mixed = raw.match(/^(\d+)\s+(\d)\/(\d)$/);
    n = mixed ? Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]) : Number(raw.replace(',', '.'));
  }
  if (andHalf) n += 0.5;
  return n * (isHours ? 60 : 1);
}

/** Parse "60 to 90 minutes", "1 1/2 hours", "an hour and a half", "2 horas" and rescale. */
/** "1 hour 30 minutes", "2 hours and 15 minutes", "1 hora y 30 minutos": one length, not two. */
const COMPOUND_TIME_RE = /\b(\d+(?:[.,]\d+)?|an?|una?)\s*(?:hours?|hrs?|h|horas?)\s+(?:and\s+|y\s+)?(\d+)\s*(?:minutes?|mins?|minutos?)\b/gi;

export function rescaleTimes(text: string, factor: number, maxMinutes = Infinity): { text: string; changed: boolean } {
  let changed = false;
  text = text.replace(COMPOUND_TIME_RE, (m: string, h: string, min: string, offset: number) => {
    if (/\b(every|cada)\s*$/i.test(text.slice(0, offset))) return m;
    changed = true;
    const total = Math.min(maxMinutes, (toMinutes(h, true, false) + Number(min)) * factor);
    return fmtRange(total, undefined, /minutos?/i.test(m) ? 'es' : 'en');
  });
  const out = text.replace(TIME_RE, (m: string, lo: string, hi: string | undefined, unit: string, half: string | undefined, offset: number) => {
    // "every 30 minutes" is a fold cadence, not a rise length; leave it.
    if (/\b(every|cada)\s*$/i.test(text.slice(0, offset))) return m;
    const isHours = /^h/i.test(unit);
    const a = Math.min(maxMinutes, toMinutes(lo, isHours, !!half) * factor);
    const b = hi ? Math.min(maxMinutes, toMinutes(hi, isHours, false) * factor) : undefined;
    changed = true;
    return fmtRange(a, b, /minutos?|horas?/i.test(unit) ? 'es' : 'en');
  });
  return { text: out, changed };
}

function fmtRange(aMin: number, bMin: number | undefined, lang: Lang): string {
  const floor = (m: number) => Math.max(5, m);
  const useHours = floor(aMin) >= 90;
  const f = (m: number) => (useHours ? String(Math.round(m / 30) / 2) : String(Math.round(floor(m) / 5) * 5));
  const unit = useHours ? (lang === 'es' ? 'horas' : 'hours') : (lang === 'es' ? 'minutos' : 'minutes');
  const to = lang === 'es' ? 'a' : 'to';
  if (bMin === undefined || f(aMin) === f(bMin)) return `${f(aMin)} ${unit}`;
  return `${f(aMin)} ${to} ${f(bMin)} ${unit}`;
}

const SENTENCE_SPLIT = /(?<=[.!?])\s+/;
/** Clause boundaries: a comma, semicolon or colon, or a bare joining word. */
const CLAUSE_SPLIT = /(?<=[,;:])\s+|\s+(?=(?:then|and then|while|before|after|until|luego|y luego|mientras|antes de|después de|hasta)\b)/i;

/**
 * Rescale times only inside clauses that talk about rising and not about
 * baking or cold retarding. Returns how many rise clauses were touched.
 */
function rescaleRiseClauses(text: string, factorFor: (riseIndex: number) => number, firstIndex = 0, maxFor: (riseIndex: number) => number = () => Infinity): { text: string; touched: number } {
  let touched = 0;
  const sentences = text.split(SENTENCE_SPLIT).map(sentence => {
    if (!RISE_WORDS.test(sentence)) return sentence;
    const parts = splitKeeping(sentence, CLAUSE_SPLIT);
    return parts.map(part => {
      if (!RISE_WORDS.test(part) || BAKE_WORDS.test(part) || COLD_WORDS.test(part)) return part;
      // Each rise clause counts on its own: "rise 1 hour. Shape, proof 1 hour"
      // in one step is a bulk rise followed by a final proof.
      const r = rescaleTimes(part, factorFor(firstIndex + touched), maxFor(firstIndex + touched));
      if (r.changed) touched += 1;
      return r.text;
    }).join('');
  });
  return { text: sentences.join(' '), touched };
}

/** Split a string at a regex but keep the separators attached to the following piece. */
function splitKeeping(s: string, re: RegExp): string[] {
  const out: string[] = [];
  const g = new RegExp(re.source, 'gi');
  let last = 0;
  for (const m of s.matchAll(g)) {
    if (m.index === undefined || m.index === last) continue;
    out.push(s.slice(last, m.index));
    last = m.index;
  }
  out.push(s.slice(last));
  return out;
}

export function editMethodToSourdough(
  steps: Step[],
  ctx: { language: Lang; richness: Richness; levain: { seed: number; flour: number; water: number; hydration: number } },
): Step[] {
  const t = T[ctx.language];
  const [firstRise, finalProof] = TO_SOURDOUGH[ctx.richness];
  const [maxFirst, maxProof] = MAX_ROOM_TEMP_RISE[ctx.richness];
  const out: Step[] = [{ text: t.buildLevain(ctx.levain.seed, ctx.levain.flour, ctx.levain.water, ctx.levain.hydration), changed: 'added' }];
  let risesSeen = 0;
  let touchedTimes = false;

  for (const s of steps) {
    let changed: Step['changed'] = 'kept';
    let note: string | undefined;
    if (s.text.trim() === T.en.timeNote || s.text.trim() === T.es.timeNote) continue;

    // Sentence-level: replace only the yeast-proofing sentence.
    // A proofing step is often two sentences: "whisk in the yeast" then "let stand until foamy".
    const sentences = s.text.split(SENTENCE_SPLIT);
    const drop = new Set<number>();
    for (let i = 0; i < sentences.length; i++) {
      const cur = sentences[i]!, next = sentences[i + 1];
      if (YEAST_PROOF.test(cur)) {
        if (next && YEAST_WAIT.test(next) && !/\b(flour|harina)\b/i.test(next)) drop.add(i + 1);
      } else if (YEAST_ADD.test(cur) && next && YEAST_WAIT.test(next) && !/\b(flour|harina)\b/i.test(next)) {
        sentences[i] = cur + ' ' + next; // treat as one proofing sentence
        drop.add(i + 1);
      }
    }
    let text = sentences.map((sentence, i) => {
      if (drop.has(i)) return '';
      if (YEAST_PROOF.test(sentence) || (YEAST_ADD.test(sentence) && YEAST_WAIT.test(sentence))) { changed = 'edited'; note = `Replaced: "${sentence}"`; return t.dissolveLevain; }
      return sentence;
    }).filter(Boolean).join(' ');

    if (/\byeast\b|\blevadura\b/i.test(text)) {
      text = text
        .replace(YEAST_AMOUNT, t.allLevain)
        .replace(/\b(?:(?:instant|active dry|dry|fresh)\s+)?yeast\b/gi, t.levainWord)
        .replace(/\ba la levadura(?:\s+(?:instantánea|seca|fresca|activa))?\b/gi, 'al ' + t.levainWord)
        .replace(/\bde la levadura(?:\s+(?:instantánea|seca|fresca|activa))?\b/gi, 'del ' + t.levainWord)
        .replace(/\bla levadura(?:\s+(?:instantánea|seca|fresca|activa))?\b/gi, 'el ' + t.levainWord)
        .replace(/\blevadura(?:\s+(?:instantánea|seca|fresca|activa))?\b/gi, t.levainWord);
      changed = 'edited';
    }
    if (RISE_WORDS.test(text)) {
      const r = rescaleRiseClauses(text, i => (i === 0 ? firstRise : finalProof), risesSeen, i => (i === 0 ? maxFirst : maxProof));
      if (r.touched > 0) { text = r.text; changed = 'edited'; touchedTimes = true; risesSeen += r.touched; }
    }
    out.push(note ? { text, changed, note } : { text, changed });
  }
  if (touchedTimes) out.push({ text: t.timeNote, changed: 'added' });
  return out;
}

export function editMethodToYeast(
  steps: Step[],
  ctx: { language: Lang; richness: Richness; yeastKind: 'instant' | 'active-dry' | 'fresh' },
): Step[] {
  const t = T[ctx.language];
  const [firstRise, finalProof] = TO_SOURDOUGH[ctx.richness];
  const intro = ctx.yeastKind === 'active-dry' ? t.adyNote : ctx.yeastKind === 'fresh' ? t.freshNote : t.skipLevain(t.yeastKinds.instant);
  const out: Step[] = [{ text: intro, changed: 'added' }];
  let risesSeen = 0;
  let touchedTimes = false;
  // A printed recipe can put "BUILD LEVAIN (NIGHT BEFORE)" on its own line with
  // the build directions in the paragraph under it. Once that title is
  // removed, the paragraphs under it go too, up to the next section title.
  const isSectionTitle = (x: string) => x.trim().length <= 48 && !/[.!?;]$/.test(x.trim()) && !/\d+\s*g\b/i.test(x);
  let inLevainBuild = false;

  for (const s of steps) {
    let changed: Step['changed'] = 'kept';
    let note: string | undefined;

    if (inLevainBuild) {
      if (isSectionTitle(s.text) && !LEVAIN_BUILD.test(s.text)) inLevainBuild = false;
      else if (/\b(levain|starter|masa madre)\b/i.test(s.text) || isSectionTitle(s.text)) {
        // Already covered by the one "no longer needed" line; keep the removed text in its note.
        const prev = out[out.length - 1]!;
        prev.note = `${prev.note ? prev.note + ' ' : ''}Removed: "${s.text}"`;
        continue;
      }
      else inLevainBuild = false;
    }

    // Yeast starts working the moment it's mixed in. If the step mixes the
    // starter and then rests (an autolyse), keep the rest yeast-free and add
    // the yeast afterwards, so the bulk time in the method stays true.
    let yeastAfterRest = false;
    // A kept copy of our own time note (from an earlier conversion) is not a step.
    if (s.text.trim() === T.en.timeNote || s.text.trim() === T.es.timeNote) continue;
    let buildRemoved = false;
    let text = s.text.split(SENTENCE_SPLIT).map(sentence => {
      if (LEVAIN_BUILD.test(sentence)) { changed = 'edited'; note = `Removed: "${sentence}"`; buildRemoved = true; return t.removedBuild; }
      // "Cover and leave 8 to 12 hours, until domed and doubled." after a removed build is part of it.
      if (buildRemoved && BUILD_CONTINUES.test(sentence) && !/\b(flour|water|salt|dough|harina|agua|sal)\b/i.test(sentence)) { note += ` Removed: "${sentence}"`; return ''; }
      if (/\b(levain|starter|masa madre)\b/i.test(sentence)) {
        changed = 'edited';
        if (REST_CLAUSE.test(s.text)) {
          const without = dropStarterMention(sentence);
          if (without && !/\b(levain|starter|masa madre)\b/i.test(without)) { yeastAfterRest = true; return without; }
        }
        return sentence
          .replace(/\ball (of )?the (levain|starter)\b/gi, `the ${t.yeastWord}`)
          .replace(/\btod[oa] (el|la) (levain|masa madre)\b/gi, `la ${t.yeastWord}`)
          .replace(/\bal (levain|masa madre)\b/gi, `a la ${t.yeastWord}`)
          .replace(/\bdel (levain|masa madre)\b/gi, `de la ${t.yeastWord}`)
          .replace(/\bel (levain|masa madre)\b/gi, `la ${t.yeastWord}`)
          .replace(/\b(ripe |active |madura |activa )?(levain|sourdough starter|starter|masa madre)\b/gi, t.yeastWord);
      }
      return sentence;
    }).filter(Boolean).join(' ');
    // A step that was only the levain build collapses to the note.
    if (text === t.removedBuild) { if (isSectionTitle(s.text)) inLevainBuild = true; out.push({ text, changed: 'edited', note }); continue; }
    if (RISE_WORDS.test(text)) {
      const r = rescaleRiseClauses(text, i => 1 / (i === 0 ? firstRise : finalProof), risesSeen);
      if (r.touched > 0) { text = r.text; changed = 'edited'; touchedTimes = true; risesSeen += r.touched; }
    }
    out.push(note ? { text, changed, note } : { text, changed });
    if (yeastAfterRest) out.push({ text: t.addYeastAfterRest(t.yeastKinds[ctx.yeastKind]), changed: 'added' });
  }
  if (touchedTimes) out.push({ text: t.timeNote, changed: 'added' });
  // One line about the levain is enough: fold "no longer needed" into the intro.
  const removed = out.filter(st => st.text === t.removedBuild);
  if (removed.length) {
    const first = out[0]!;
    first.text = `${t.removedBuild} ${first.text}`;
    first.changed = 'edited';
    first.note = removed.map(st => st.note).filter(Boolean).join(' ') || undefined;
    return out.filter(st => st.text !== t.removedBuild);
  }
  return out;
}

/**
 * Remove the starter from a mixing sentence without touching the rest of it:
 * "Mix starter and water, add flour, rest 1 hour" -> "Mix the water, add flour, rest 1 hour".
 * "Dissolve the levain in the water" -> "Add the water". Returns null when
 * the sentence doesn't match a known shape, so the caller can fall back.
 */
function dropStarterMention(sentence: string): string | null {
  const ref = STARTER_REF.source;
  const det = '(?:the\\s+|your\\s+|all\\s+(?:of\\s+)?(?:the\\s+|your\\s+)|el\\s+|la\\s+|tod[oa]\\s+(?:el|la)\\s+|tu\\s+)?';
  const rules: [RegExp, string][] = [
    // "Dissolve the levain in(to) the water" / "Disuelve el levain en el agua"
    [new RegExp(`\\b(?:dissolve|tear|break up|crumble)\\b[^,.]*?\\b${det}${ref}\\s+(?:into|in)\\s+${det}`, 'i'), 'Add the '],
    [new RegExp(`\\b(?:disuelve|disolver|trocea)\\b[^,.]*?\\b${det}${ref}\\s+en\\s+${det}`, 'i'), 'Añade '],
    // "Mix (the) starter and/with the water" -> "Mix the water"
    [new RegExp(`\\b(mix|combine|stir|whisk|mezcla|combina|bate)\\s+(?:together\\s+)?${det}${ref}\\s+(?:and|with|con|y)\\s+${det}`, 'i'), '$1 the '],
    // "Mix the water and (the) starter" -> "Mix the water"
    [new RegExp(`\\s*(?:,\\s*)?(?:and|with|con|y)\\s+${det}${ref}\\b`, 'i'), ''],
    // "Add the starter, water and flour" -> "Add the water and flour"
    [new RegExp(`\\b(add|añade|agrega)\\s+${det}${ref}\\s*,\\s*`, 'i'), '$1 the '],
  ];
  for (const [re, rep] of rules) {
    if (re.test(sentence)) {
      const out = sentence.replace(re, rep).replace(/\bthe the\b/gi, 'the').replace(/\s{2,}/g, ' ');
      return out;
    }
  }
  return null;
}

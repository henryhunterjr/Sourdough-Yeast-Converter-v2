/**
 * Amount parsing and conversion to grams.
 *
 * Volumes convert through the ingredient's class (ingredients.ts), never
 * through a string lookup, so "3 1/2 cups bread flour", "3.5 c. Bread Flour"
 * and "3½ cups of bread flour" all land on the same number.
 */
import { classify, type IngredientClass } from './ingredients.js';

const CUP_ML = 236.6;

/** Volume units expressed in US cups. */
const VOLUME_IN_CUPS: Record<string, number> = {
  cup: 1, cups: 1, c: 1, taza: 1, tazas: 1,
  tbsp: 1 / 16, tablespoon: 1 / 16, tablespoons: 1 / 16, tbs: 1 / 16, T: 1 / 16,
  cucharada: 1 / 16, cucharadas: 1 / 16, cda: 1 / 16, cdas: 1 / 16,
  tsp: 1 / 48, teaspoon: 1 / 48, teaspoons: 1 / 48, t: 1 / 48,
  cucharadita: 1 / 48, cucharaditas: 1 / 48, cdta: 1 / 48, cdtas: 1 / 48,
  pint: 2, pints: 2, pt: 2, quart: 4, quarts: 4, qt: 4,
  'fl oz': 1 / 8, 'fluid ounce': 1 / 8, 'fluid ounces': 1 / 8,
};

/** Mass units in grams. */
const MASS_IN_GRAMS: Record<string, number> = {
  g: 1, gram: 1, grams: 1, gr: 1, gramo: 1, gramos: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000, kilo: 1000, kilos: 1000,
  oz: 28.35, ounce: 28.35, ounces: 28.35, onza: 28.35, onzas: 28.35,
  lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6, libra: 453.6, libras: 453.6,
};

/** Liquid volume units in millilitres, treated as grams (water density). */
const ML_UNITS: Record<string, number> = {
  ml: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1, mililitro: 1, mililitros: 1,
  l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000, litro: 1000, litros: 1000,
  cl: 10, dl: 100,
};

/** Named pieces. */
const PIECE_UNITS: Record<string, { grams: number; onlyFor?: RegExp }> = {
  stick: { grams: 113, onlyFor: /butter|mantequilla/i },
  sticks: { grams: 113, onlyFor: /butter|mantequilla/i },
  barra: { grams: 113, onlyFor: /mantequilla/i },
  packet: { grams: 7, onlyFor: /yeast|levadura/i },
  packets: { grams: 7, onlyFor: /yeast|levadura/i },
  envelope: { grams: 7, onlyFor: /yeast|levadura/i },
  sobre: { grams: 7, onlyFor: /levadura/i },
  sobres: { grams: 7, onlyFor: /levadura/i },
  cube: { grams: 42, onlyFor: /yeast|levadura/i },
  cubito: { grams: 25, onlyFor: /levadura/i },
  pinch: { grams: 0.3 },
  pizca: { grams: 0.3 },
};

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75,
  '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875, '⅕': 0.2, '⅖': 0.4, '⅗': 0.6, '⅘': 0.8,
};

const UNIT_WORDS = [
  ...Object.keys(VOLUME_IN_CUPS),
  ...Object.keys(MASS_IN_GRAMS),
  ...Object.keys(ML_UNITS),
  ...Object.keys(PIECE_UNITS),
].sort((a, b) => b.length - a.length);

// Longest first so "tablespoons" wins over "t".
const UNIT_RE = UNIT_WORDS.map(u => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

/** "3 1/2", "3½", "1.25", "½", "2-3" (takes the first number of a range). */
// Plain fractions come first so "1/3 cup" is never read as "1" followed by "/3 cup".
const AMOUNT_RE = `(\\d+/\\d+|\\d+(?:[.,]\\d+)?(?:\\s*[-–]\\s*\\d+(?:[.,]\\d+)?)?(?:\\s+\\d+/\\d+|\\s*[½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘])?|[½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘])`;

export interface ParsedAmount {
  amount: number;
  unit: string;       // normalised unit word, '' when none, 'each' for counts
  name: string;       // the rest of the line, cleaned
  text: string;       // original line
}

export function parseAmount(raw: string): ParsedAmount | null {
  const text = raw.trim();
  let line = text
    .replace(/^[-•*·]\s*/, '')
    // "~250g levain", "≈ 250 g", "about 250g", "aprox. 250 g": the number is still the amount.
    .replace(/^(?:~|≈|about\s+|approx\.?\s+|approximately\s+|aprox\.?\s+|aproximadamente\s+)\s*(?=\d|[½⅓⅔¼¾⅛⅜⅝⅞])/i, '')
    .replace(/\s+/g, ' ');

  // 1) Explicit grams in parentheses win: "1 cup (120g) flour", "1 large egg (50g)".
  const parenGrams = line.match(/\((?:about |approx\.? |≈)?(\d+(?:[.,]\d+)?)\s*(?:g|grams?|gr)\b[^)]*\)/i);
  if (parenGrams) {
    const grams = toNumber(parenGrams[1]!);
    const name = cleanName(line.replace(parenGrams[0], ' ').replace(new RegExp(`^${AMOUNT_RE}\\s*(?:(?:${UNIT_RE})\\b\\.?)?\\s*(?:of\\s+|de\\s+)?(?:(?:large|medium|small|extra[- ]large|xl|jumbo|grande|mediano|pequeño)\\s+)?`, 'i'), ''));
    return { amount: grams, unit: 'g', name, text };
  }

  // 2) "or 240g water" alternatives: prefer the gram figure.
  const orGrams = line.match(/\b(?:or|o)\s+(\d+(?:[.,]\d+)?)\s*(g|grams?|ml)\b/i);
  if (orGrams) {
    const grams = toNumber(orGrams[1]!);
    const name = cleanName(line.replace(/^.*?\b(?:or|o)\s+\d+(?:[.,]\d+)?\s*(?:g|grams?|ml)\b\s*/i, ''));
    return { amount: grams, unit: 'g', name, text };
  }

  // 3) Leading amount + optional unit + name.
  const m = line.match(new RegExp(`^${AMOUNT_RE}\\s*(${UNIT_RE})?\\.?\\s+(?:of\\s+|de\\s+)?(.+)$`, 'i'));
  if (m) {
    // A capital T is the old American shorthand for tablespoon; lowercase t is teaspoon.
    let unit = m[2] === 'T' ? 'tbsp' : (m[2] ?? '').toLowerCase();
    const amount = parseNumber(m[1]!, unit);
    let name = m[3]!;
    // "1 large egg": size word is not a unit.
    if (!unit) {
      const size = name.match(/^(large|medium|small|extra[- ]large|xl|jumbo|grande|mediano|pequeño)\s+(.+)$/i);
      if (size) name = size[2]!;
      unit = 'each';
    }
    return { amount, unit, name: cleanName(name), text };
  }

  // 4) Trailing amount: "bread flour 500g" / "harina 500 g".
  const tail = line.match(new RegExp(`^(.+?)[,:]?\\s+${AMOUNT_RE}\\s*(${UNIT_RE})\\.?$`, 'i'));
  if (tail) {
    const unit = (tail[3] ?? '').toLowerCase();
    return { amount: parseNumber(tail[2]!, unit), unit, name: cleanName(tail[1]!), text };
  }

  return null;
}

/**
 * Units where "1,000" can only sensibly mean a thousand: grams, millilitres,
 * or a bare number (which reads as grams). Everywhere else (kg, litres,
 * pounds, cups) a comma is a decimal point, so "1,250 kg" is 1.25 kg.
 */
const THOUSANDS_OK = new Set(['', 'each', 'g', 'gram', 'grams', 'gr', 'gramo', 'gramos', 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'mililitro', 'mililitros']);

export function parseNumber(s: string, unit = ''): number {
  const thousands = THOUSANDS_OK.has(unit.toLowerCase());
  s = s.trim();
  // Range: take the first number.
  const range = s.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*\d+/);
  if (range) s = range[1]!;
  let total = 0;
  for (const [ch, v] of Object.entries(UNICODE_FRACTIONS)) {
    if (s.includes(ch)) { total += v; s = s.replace(ch, ' '); }
  }
  for (const part of s.split(/\s+/).filter(Boolean)) {
    const frac = part.match(/^(\d+)\/(\d+)$/);
    if (frac) total += Number(frac[1]) / Number(frac[2]);
    else total += toNumber(part, thousands);
  }
  return total;
}

function toNumber(s: string, thousands = true): number {
  // "1,000g" and "2,500 ml" use a thousands separator. "1,5 kg", "0,250 kg"
  // and "1,250 kg" are European decimals, so the rule only applies to gram
  // and millilitre amounts that don't start with zero.
  if (thousands && /^[1-9]\d{0,2}(?:,\d{3})+$/.test(s)) return Number(s.replace(/,/g, ''));
  return Number(s.replace(',', '.'));
}

/** Strip prep notes that aren't part of the ingredient's identity. */
export function cleanName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/,?\s*(plus|más|mas)\s+(extra|more|\d+[^,]*?)\s+(for|para)\s+[^,]*$/i, '')
    .replace(/,\s*(softened|melted|cold|cubed|diced|cut into[^,]*|divided|sifted|packed|beaten|lightly beaten|room temperature|at room temperature|lukewarm|warm(ed)?|very soft|for the pan|to taste|a temperatura ambiente|tibia|tibio|derretida|blanda|ablandada|fr[ií]a|fr[ií]o)\b[^,]*/gi, '')
    .replace(/\s+(room temperature|at room temperature|a temperatura ambiente|softened|melted|lukewarm|tibia|tibio)$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[,;:\s]+$/, '')
    .trim();
}

export interface GramsResult {
  grams: number;
  /** How the number was reached, for the audit trail. */
  via: 'mass' | 'ml' | 'volume' | 'piece' | 'count' | 'assumed-grams';
  cls: IngredientClass;
}

/**
 * Convert a parsed amount to grams using the ingredient class.
 * Returns null when a volume can't be converted (no density for that class).
 */
export function toGrams(p: ParsedAmount): GramsResult | null {
  const cls = classify(p.name);
  const unit = p.unit;

  if (unit in MASS_IN_GRAMS) return { grams: p.amount * MASS_IN_GRAMS[unit]!, via: 'mass', cls };
  if (unit in ML_UNITS) return { grams: p.amount * ML_UNITS[unit]! * (cls.gramsPerCup ? cls.gramsPerCup / CUP_ML : 1), via: 'ml', cls };
  if (unit in VOLUME_IN_CUPS) {
    if (!cls.gramsPerCup) return null;
    return { grams: p.amount * VOLUME_IN_CUPS[unit]! * cls.gramsPerCup, via: 'volume', cls };
  }
  if (unit in PIECE_UNITS) {
    const piece = PIECE_UNITS[unit]!;
    if (piece.onlyFor && !piece.onlyFor.test(p.name)) return null;
    return { grams: p.amount * piece.grams, via: 'piece', cls };
  }
  if (unit === 'each' || unit === '') {
    if (cls.gramsEach) return { grams: p.amount * cls.gramsEach, via: 'count', cls };
    // "500 flour": a bare number on a non-countable ingredient means grams.
    if (p.amount >= 5) return { grams: p.amount, via: 'assumed-grams', cls };
    return null;
  }
  return null;
}

const VOLUME_UNIT_WORDS = new Set(Object.keys(VOLUME_IN_CUPS).map(u => u.toLowerCase()));
/** True when a typed unit is a US volume measure (cups, tbsp, tsp). */
export function isVolumeUnit(unit: string): boolean {
  return VOLUME_UNIT_WORDS.has(unit.toLowerCase()) || unit === 'T';
}

const FRACTIONS: [number, string][] = [[0, ''], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾'], [1, '']];
function fractionText(x: number): string {
  const whole = Math.floor(x);
  let best = FRACTIONS[0]!, err = Infinity;
  for (const f of FRACTIONS) { const e = Math.abs(x - whole - f[0]); if (e < err) { err = e; best = f; } }
  const w = best[0] === 1 ? whole + 1 : whole;
  return `${w > 0 ? w : ''}${best[1]}` || '0';
}

/**
 * A kitchen-friendly volume for an adjusted amount, e.g. "3¼ cups" or "2 tbsp".
 * Returns null when the ingredient has no density. Always approximate.
 */
export function approxVolume(name: string, grams: number, lang: 'en' | 'es' = 'en'): string | null {
  const cls = classify(name);
  if (!cls.gramsPerCup || grams <= 0) return null;
  const cups = grams / cls.gramsPerCup;
  const u = lang === 'es'
    ? { cup: 'taza', cups: 'tazas', tbsp: 'cda', tsp: 'cdta' }
    : { cup: 'cup', cups: 'cups', tbsp: 'tbsp', tsp: 'tsp' };
  if (cups >= 0.25) { const t = fractionText(cups); return `${t} ${cups > 1.12 ? u.cups : u.cup}`; }
  const tbsp = cups * 16;
  if (tbsp >= 1) return `${fractionText(tbsp)} ${u.tbsp}`;
  return `${fractionText(cups * 48)} ${u.tsp}`;
}

export const ROUND = {
  /** Display rounding: whole grams above 10g, half grams below. */
  grams(g: number): number {
    if (!Number.isFinite(g)) return 0;
    return g >= 10 ? Math.round(g) : Math.round(g * 2) / 2;
  },
  pct(p: number): number {
    return Math.round(p * 10) / 10;
  },
};

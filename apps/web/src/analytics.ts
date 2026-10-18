/**
 * What members do with the converter, counted in Vercel Web Analytics.
 * Only categories are sent (paste vs photo, to-yeast vs to-sourdough).
 * Never the recipe text, a file, or anything that identifies a person.
 */
import { track } from '@vercel/analytics';

type Props = Record<string, string | number | boolean>;
const send = (name: string, props?: Props) => { try { track(name, props); } catch { /* analytics never breaks the app */ } };

export const analytics = {
  /** A recipe was submitted. */
  convert: (p: { input: 'paste' | 'photo' | 'pdf'; direction: 'to-sourdough' | 'to-yeast' | 'auto'; language: 'en' | 'es' }) => send('convert', p),
  /** The reader finished: who read it and whether the result was usable. */
  result: (p: { source: 'model' | 'parser'; direction: 'to-sourdough' | 'to-yeast'; blocked: boolean; language: 'en' | 'es' }) => send('result', p),
  /** Print, Save PDF, Share or Copy. */
  export: (p: { action: 'print' | 'pdf' | 'share' | 'copy'; direction: 'to-sourdough' | 'to-yeast'; tab: 'converted' | 'original' }) => send('export', p),
  /** The safety gate stopped a print. */
  blocked: (p: { direction: 'to-sourdough' | 'to-yeast'; reasons: number }) => send('blocked', p),
};

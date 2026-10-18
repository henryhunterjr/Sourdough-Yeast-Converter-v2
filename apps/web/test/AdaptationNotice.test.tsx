import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { analyze, convertToSourdough, convertToYeast, parseRecipeText } from '@bgb/dough-core';
import { AdaptationNotice, adaptationText, needsGrainGuidance } from '../src/components/AdaptationNotice';
import { t } from '../src/i18n';

const parseRecipe = (text: string) => parseRecipeText(text).recipe;

describe('calculated adaptations and original grain handling', () => {
  for (const flour of ['einkorn', 'spelt', 'rye', 'emmer', 'khorasan', 'fresh-milled wheat', 'whole wheat']) {
    it(`keeps ${flour} handling visible and in copied/shared text without changing either conversion`, () => {
      const original = parseRecipe(`500g ${flour} flour\n350g water\n10g salt\n5g instant yeast\n\nMethod\n1. Mix gently. Avoid intensive kneading.\n2. Rise 1 hour.\n3. Bake 30 minutes.`);
      const before = JSON.stringify(original);
      const converted = convertToSourdough(original);
      const reverse = convertToYeast(converted.recipe);
      const html = renderToStaticMarkup(<AdaptationNotice original={original} s={t('en')} />);
      expect(html).toContain('Calculated adaptation');
      expect(html).toContain('Mix gently. Avoid intensive kneading.');
      expect(html).toContain('It does not predict');
      expect(adaptationText(original, t('en'))).toContain('Mix gently. Avoid intensive kneading.');
      expect(JSON.stringify(original)).toBe(before);
      expect(convertToSourdough(original)).toEqual(converted);
      expect(convertToYeast(converted.recipe)).toEqual(reverse);
      expect(analyze(converted.recipe).hydration).toBeCloseTo(70, 10);
    });
  }

  it('retains Spanish grain guidance and the source method', () => {
    const original = parseRecipe('500g harina de espelta\n350g agua\n10g sal\n100g masa madre\n\nMétodo\n1. Mezcla suavemente sin amasar en exceso.\n2. Deja fermentar 4 horas.');
    expect(needsGrainGuidance(original)).toBe(true);
    const html = renderToStaticMarkup(<AdaptationNotice original={original} s={t('es')} />);
    expect(html).toContain('Adaptación calculada');
    expect(html).toContain('Mezcla suavemente sin amasar en exceso.');
    expect(adaptationText(original, t('es'))).toContain('No predice la absorción');
  });

  it('warns when grain handling instructions were not supplied', () => {
    const original = parseRecipe('500g einkorn flour\n350g water\n5g yeast');
    expect(adaptationText(original, t('en'))).toContain('No original method was included');
  });

  it('shows no grain notice on a country loaf with 9% whole wheat (Oct 18 work order, item 3)', () => {
    const original = parseRecipe('Country Sourdough\n100g active starter\n375g water\n450g bread flour\n50g whole wheat flour\n10g salt\n\nMethod\n1. Mix starter and water, add flour, rest 1 hour.\n2. Add salt. Bulk ferment 4 to 5 hours.\n3. Shape and refrigerate overnight.\n4. Bake at 500F.');
    expect(needsGrainGuidance(original)).toBe(false);
    const html = renderToStaticMarkup(<AdaptationNotice original={original} s={t('en')} />);
    expect(html).not.toContain('grain-notice');
  });

  it('still shows it at 50% whole wheat, at 25%, and for any rye or einkorn', () => {
    expect(needsGrainGuidance(parseRecipe('250g bread flour\n250g whole wheat flour\n350g water\n10g salt\n5g instant yeast\nMethod\n1. Mix. Rise 1 hour. Bake.'))).toBe(true);
    expect(needsGrainGuidance(parseRecipe('375g bread flour\n125g whole wheat flour\n350g water\n10g salt\n5g instant yeast\nMethod\n1. Mix. Rise 1 hour. Bake.'))).toBe(true);
    expect(needsGrainGuidance(parseRecipe('450g bread flour\n50g rye flour\n350g water\n10g salt\n5g instant yeast\nMethod\n1. Mix. Rise 1 hour. Bake.'))).toBe(true);
    expect(needsGrainGuidance(parseRecipe('480g bread flour\n20g einkorn flour\n350g water\n10g salt\n5g instant yeast\nMethod\n1. Mix. Rise 1 hour. Bake.'))).toBe(true);
    expect(needsGrainGuidance(parseRecipe('400g harina de fuerza\n100g harina integral\n350g agua\n10g sal\n5g levadura\nMétodo\n1. Mezcla. Deja levar 1 hora. Hornea.'))).toBe(false);
    expect(needsGrainGuidance(parseRecipe('300g harina de fuerza\n200g harina integral\n350g agua\n10g sal\n5g levadura\nMétodo\n1. Mezcla. Deja levar 1 hora. Hornea.'))).toBe(true);
  });

  it('gives authored recipes precedence even for ordinary white flour', () => {
    const original = parseRecipe('500g bread flour\n350g water\n5g yeast');
    expect(needsGrainGuidance(original)).toBe(false);
    const html = renderToStaticMarkup(<AdaptationNotice original={original} s={t('en')} />);
    expect(html).toContain('use that authored version first');
    expect(html).not.toContain('Original method to keep');
  });
});

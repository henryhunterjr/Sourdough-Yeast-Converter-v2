import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyze, convertToSourdough, parseRecipeText } from '@bgb/dough-core';
import { readRecipe, toRecipe } from '../src/reader.js';
import { handler } from '../src/http.js';
const text = (name: string) => readFileSync(new URL(`../../../packages/core/test/fixtures/pantry-pdf/${name}.txt`, import.meta.url), 'utf8');
const model = JSON.parse(readFileSync(new URL('../../../apps/web/test/fixtures/pantry-pdf/cranberry-model.json', import.meta.url), 'utf8'));

describe('Pantry PDFs (deterministic responses, no actual AI/OCR)', () => {
  it('cleans table exports before a provider call and still reads every ingredient when that provider fails', async () => {
    let seen = '';
    const r = await readRecipe(text('einkorn-table'), { name:'unavailable-fixture', async read(input) { seen=input.text!; throw Error('fixture unavailable'); } });
    expect(seen).not.toContain("Baker's %");
    expect(seen).not.toContain('levain subtotal');
    expect(r.recipe.components.flatMap(c=>c.ingredients)).toHaveLength(22);
    expect(r.recipe.steps).toHaveLength(16); // section titles are their own steps
    expect(r.recipe.sourceNotes?.join(' ')).toContain('Tangzhong Detected');
    expect(r.flags.some(f=>f.message.includes('169g'))).toBe(true);
  });
  it('checks a five-page vision reading against the full one-sheet transcription, without counting summaries or alternate versions', async () => {
    let pages=0;
    const r = await readRecipe({ images: Array(5).fill({data:'AAAA',mediaType:'image/jpeg'}) }, {name:'manual-vision-fixture',async read(input){pages=input.images!.length;return JSON.stringify(model);}});
    expect(pages).toBe(5);
    expect(r.source).toBe('model');
    expect(r.recipe.components.flatMap(c=>c.ingredients)).toHaveLength(13);
    expect(r.recipe.components[0]!.name).toBe('DOUGH (YEASTED VERSION)');
    expect(analyze(r.recipe).totalFlour).toBe(500);
    expect(analyze(r.recipe).yeast).toBe(7);
    const lines=r.recipe.components.flatMap(c=>c.ingredients.map(i=>i.original?.text)).join('\n');
    expect(lines).toContain('3 1/2 tbsp');
    expect(lines).toContain('room temperature');
    expect(r.recipe.steps.map(s=>s.text).join(' ')).toContain('190°F (88°C) internal');
    expect(r.flags.filter(f=>f.level==='warning')).toEqual([]);
    expect(analyze(convertToSourdough(r.recipe).recipe).hydration).toBeCloseTo(analyze(r.recipe).hydration,10);
  });
  it('HTTP accepts every page of the actual five-page export, rejects too many pages before invoking the model', async () => {
    let calls=0;
    const h=handler({provider:{name:'manual-vision-fixture',async read(){calls++;return JSON.stringify(model);}}});
    const post=(n:number)=>h(new Request('https://test/read',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({images:Array(n).fill({data:'AAAA',mediaType:'image/jpeg'})})}));
    expect((await post(5)).status).toBe(200);
    expect((await post(13)).status).toBe(413);
    expect(calls).toBe(1);
  });
  it('preserves one-sheet volume wording when a vision transcription omits page branding', async () => {
    const reading=structuredClone(model);
    reading.transcript=reading.transcript.split('\n').filter((line:string)=>!/recipepantry\.app|Recipe Pantry|CRUST & CRUMB|FROM THE PANTRY|Print This/i.test(line)).join('\n');
    const r=await readRecipe({images:[{data:'AAAA',mediaType:'image/jpeg'}]},{name:'manual-vision-fixture',async read(){return JSON.stringify(reading);}});
    const lines=r.recipe.components.flatMap(c=>c.ingredients.map(i=>i.original?.text)).join('\n');
    expect(lines).toContain('3 1/2 tbsp');
    expect(lines).toContain('1/2 cup + 1 tbsp');
    expect(analyze(r.recipe).totalFlour).toBe(500);
  });
  it('retains all ordinary sample math through the PDF preprocessing path', async () => {
    const ordinary='Loaf\n500g flour\n350g water\n10g salt\n5g instant yeast\n\nMethod\n1. Mix gently.\n2. Rise 1 hour.';
    const r=await readRecipe(ordinary,null);
    expect(r.recipe).toEqual(parseRecipeText(ordinary).recipe);
    expect(analyze(convertToSourdough(r.recipe).recipe).hydration).toBe(70);
  });
  it('keeps an explicitly printed preferment reference visible without changing reference math', () => {
    const ing=(amount:number,name:string,isReference=false)=>({amount,unit:'g',name,note:'',role:'starter' as const,isReference,isFinishing:false});
    const reading={title:'Loaf',language:'en' as const,uncertainties:[],transcript:'',steps:[],components:[{name:'Levain',kind:'preferment' as const,ingredients:[ing(38,'starter'),{...ing(77,'water'),role:'liquid' as const},{...ing(54,'spelt flour'),role:'flour' as const}]},{name:'Dough',kind:'dough' as const,ingredients:[ing(192,'Levain',true)]}]};
    const r=toRecipe(reading,'192g Levain (from above)',100,[]);
    const ref=r.components[1]!.ingredients[0]!;
    expect(ref.grams).toBe(169);
    expect(ref.original!.text).toBe('192g Levain (from above)');
    expect(analyze(r).totalFlour).toBe(73);
  });
});

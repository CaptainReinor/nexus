import {expect,it,vi} from 'vitest';
import {labelDraftSchema,labelImageSchema,photoFoodAction,parsePhotoDraft,saveFocusLabel} from './focus-label';
import {saveFocusTurn} from './focus-mode';
import type {Snapshot} from './snapshot-sync';
vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
it('keeps an unrecognized photo unknown even when the provider substitutes zeroes',()=>{
 expect(parsePhotoDraft(JSON.stringify({name:'',basisGrams:0,kcal:0,proteinG:0}))).toMatchObject({name:'',basisGrams:null,kcal:null,proteinG:null});
 expect(()=>parsePhotoDraft(JSON.stringify({name:'Яблоко',basisGrams:0,kcal:100}))).toThrow();
});
it('saves reviewed photo nutrition as approximate portion totals, without rescaling to 100g or exporting',()=>{
 const s:Snapshot={format:'nexus-backup',version:16,exportedAt:'',tables:{settings:[]}};
 const action=photoFoodAction(labelDraftSchema.parse({name:'Курица с рисом',basisGrams:350,kcal:520.4,proteinG:40,fatG:12,carbsG:63,vitamins:[{id:'B12',amount:1}]}),'2026-10-13');
 saveFocusTurn(s,{id:crypto.randomUUID(),day:'2026-10-13',text:'Фото еды: Курица с рисом',reply:'Оценка по фото',actions:[action],replace:false,expectedUpdatedAt:null});
 expect(s.tables.food_entries[0]).toMatchObject({grams:350,kcal:520,protein_g:40,estimated:1,nutrition_estimated:1});expect(s.tables.finance_transactions??[]).toHaveLength(0);
 expect(()=>photoFoodAction(labelDraftSchema.parse({name:'',basisGrams:null,kcal:null}),'2026-10-13')).toThrow();
});
it('converts reviewed label values to 100g, preserves estimated vitamins, and creates no eaten portion',()=>{
 const s:Snapshot={format:'nexus-backup',version:16,exportedAt:'',tables:{settings:[]}};
 const p=saveFocusLabel(s,labelDraftSchema.parse({name:'Йогурт',brand:'Пример',basisGrams:200,kcal:180,proteinG:12,fatG:4,carbsG:24,vitamins:[{id:'B12',amount:1}],printedVitamins:[]}));
 const n=JSON.parse(String(p.nutrients_json));expect(n).toMatchObject({kcal:90,protein_g:6,fat_g:2,carbs_g:12,sugar_g:null,sources:{kcal:'user',protein_g:'user',B12:'estimate'}});expect(s.tables.food_entries).toHaveLength(0);
});
it('rejects missing label basis and remote URLs rather than guessing',()=>{
 const s:Snapshot={format:'nexus-backup',version:16,exportedAt:'',tables:{settings:[]}};expect(()=>saveFocusLabel(s,labelDraftSchema.parse({name:'Йогурт',kcal:100}))).toThrow('массу');expect(labelImageSchema.safeParse('https://example.test/a.jpg').success).toBe(false);expect(labelImageSchema.safeParse('data:image/svg+xml;base64,abc').success).toBe(false);
});

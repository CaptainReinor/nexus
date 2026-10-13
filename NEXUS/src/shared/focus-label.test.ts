import {expect,it,vi} from 'vitest';
import {labelDraftSchema,labelImageSchema,saveFocusLabel} from './focus-label';
import type {Snapshot} from './snapshot-sync';
vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-13T10:00:00Z'));
it('converts reviewed label values to 100g, preserves estimated vitamins, and creates no eaten portion',()=>{
 const s:Snapshot={format:'nexus-backup',version:16,exportedAt:'',tables:{settings:[]}};
 const p=saveFocusLabel(s,labelDraftSchema.parse({name:'Йогурт',brand:'Пример',basisGrams:200,kcal:180,proteinG:12,fatG:4,carbsG:24,vitamins:[{id:'B12',amount:1}],printedVitamins:[]}));
 const n=JSON.parse(String(p.nutrients_json));expect(n).toMatchObject({kcal:90,protein_g:6,fat_g:2,carbs_g:12,sugar_g:null,sources:{kcal:'user',protein_g:'user',B12:'estimate'}});expect(s.tables.food_entries).toHaveLength(0);
});
it('rejects missing label basis and remote URLs rather than guessing',()=>{
 const s:Snapshot={format:'nexus-backup',version:16,exportedAt:'',tables:{settings:[]}};expect(()=>saveFocusLabel(s,labelDraftSchema.parse({name:'Йогурт',kcal:100}))).toThrow('массу');expect(labelImageSchema.safeParse('https://example.test/a.jpg').success).toBe(false);expect(labelImageSchema.safeParse('data:image/svg+xml;base64,abc').success).toBe(false);
});

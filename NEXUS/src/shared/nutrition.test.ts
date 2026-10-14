import {expect,it} from 'vitest';
import {nutritionTotals,vitaminDailyProgress} from './nutrition';
import {localDay} from './domain';
import {mentorResponseFormat,parseMentorReply} from './focus-mode';

const food={kind:'food',day:localDay(),name:'Готовое куриное филе без масла',grams:200,kcal:300,estimated:false,quality:'mixed',nutritionEstimated:false,proteinG:60,fatG:7,carbsG:0,sugarG:0,fiberG:0,vitamins:[{id:'B12',amount:.5}],note:''};
it('compares daily intake in matching units and averages recorded days without inventing missing vitamins',()=>{
 expect(vitaminDailyProgress({id:'C',total:90,estimated:false,missing:0},2)).toEqual({amount:45,percent:50,estimated:false});
 expect(vitaminDailyProgress({id:'B12',total:4.8,estimated:false,missing:0},1).percent).toBe(200);
 expect(vitaminDailyProgress({id:'D',total:null,estimated:false,missing:2},2).percent).toBeNull();
 expect(vitaminDailyProgress({id:'D',total:0,estimated:false,missing:0},1).percent).toBe(0);
 expect(vitaminDailyProgress({id:'C',total:45,estimated:false,missing:1},1)).toMatchObject({percent:50,estimated:true});
 expect(vitaminDailyProgress({id:'C',total:90,estimated:false,missing:0},0).percent).toBeNull();
});
it('restores omitted unknowns without inventing zero amounts and keeps reference estimates approximate',()=>{
 const reply=parseMentorReply(JSON.stringify({reply:'Тест',actions:[food]}),'Съел 200 г готового куриного филе без масла.');
 expect(reply.actions[0]).toMatchObject({id:null,kcal:330,estimated:true,nutritionEstimated:true,proteinG:62,vitamins:expect.arrayContaining([{id:'B12',amount:.68}])});
 const expense=parseMentorReply(JSON.stringify({reply:'Уточни сумму.',actions:[{kind:'expense',day:localDay(),note:'Кофе'}]}),'Купил кофе, цену не помню.');
 expect(expense.actions[0]).toMatchObject({amountCents:null,accountId:null,categoryId:null});
});
it('does not turn a guessed portion into a weighed portion or override an explicitly reported energy value',()=>{
 expect(parseMentorReply(JSON.stringify({reply:'Тест',actions:[food]}),'Съел куриное филе.').actions[0]).toMatchObject({grams:null,estimated:true});
 expect(parseMentorReply(JSON.stringify({reply:'Тест',actions:[food]}),'Съел 200 граммов филе, по этикетке 300 ккал.').actions[0]).toMatchObject({kcal:300,estimated:false});
});
it('totals only known composition and distinguishes real zero from missing data',()=>{
 const x=nutritionTotals([{protein_g:10,sugar_g:0,nutrition_estimated:0,vitamins_json:'[{"id":"C","amount":5}]'},{protein_g:null,sugar_g:null,nutrition_estimated:1,vitamins_json:'[]'}]);
 expect(x.macros.proteinG).toEqual({total:10,known:1,missing:1,estimated:false});expect(x.macros.sugarG.total).toBe(0);expect(x.macros.fatG.total).toBeNull();expect(x.vitamins.find(v=>v.id==='D')?.total).toBeNull();expect(x.vitamins.find(v=>v.id==='C')).toMatchObject({total:5,known:1,missing:1,unit:'мг'});
});
it('rejects repeated vitamin quantities and produces a provider schema without nullable explosion',()=>{
 expect(()=>parseMentorReply(JSON.stringify({reply:'Тест',actions:[{...food,vitamins:[{id:'C',amount:5},{id:'C',amount:10}]}]}),'Тест')).toThrow();
 const schema=JSON.stringify(mentorResponseFormat);expect(schema).not.toContain('oneOf');expect(schema).not.toContain('"type":"null"');
});

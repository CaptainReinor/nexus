import {expect,it} from 'vitest';
import {directCapture,homePreferences,saveHomePreferences} from './home';
import type {Snapshot} from './snapshot-sync';
const day='2026-11-17';
it('validates manual money and sleep before writing and keeps walks out of gym statistics',()=>{
 expect(directCapture('expense','12 500,25',day)).toMatchObject([{amountCents:1250025,accountId:1,categoryId:9}]);
 expect(()=>directCapture('expense','0',day)).toThrow('больше нуля');expect(()=>directCapture('sleep','',day,'','25:00','08:00')).toThrow('ЧЧ:ММ');
 expect(directCapture('activity','Прогулка',day)).toMatchObject([{type:'other'}]);expect(directCapture('activity','Спортзал',day)).toMatchObject([{type:'gym'}]);
});
it('stores home preferences in the synchronized snapshot and preserves unspecified options',()=>{
 const s:Snapshot={format:'nexus-backup',version:16,exportedAt:'',tables:{settings:[]}};saveHomePreferences(s,{work:true});saveHomePreferences(s,{animations:false});
 expect(homePreferences(structuredClone(s))).toEqual({dailyChecklist:['weight','sleep'],progress:true,work:true,investments:false,care:true,animations:false,haptics:true,sound:false});
});

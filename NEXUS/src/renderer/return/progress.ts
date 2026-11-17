import type {Snapshot} from '../../shared/snapshot-sync';
import type {FocusTurnInput} from '../../shared/focus-mode';
import {localDay,weekStart,money} from '../../shared/domain';
import {shiftDay} from '../../shared/daily-core';

export function weekTrail(snapshot:Snapshot,today=localDay()){
 const weights=new Set((snapshot.tables.weight_entries??[]).map(r=>String(r.day)));
 const sleep=new Set((snapshot.tables.health_daily_entries??[]).filter(r=>typeof r.sleep_minutes==='number'&&r.sleep_minutes>0).map(r=>String(r.day)));
 const journal=new Set((snapshot.tables.mentor_turns??[]).filter(r=>String(r.raw_text??'').trim()).map(r=>String(r.day)));
 const other=new Set([...(snapshot.tables.food_entries??[]),...(snapshot.tables.activity_entries??[])].map(r=>String(r.day)));
 const start=weekStart(new Date(today+'T12:00:00'),1);
 return Array.from({length:7},(_,index)=>{const day=shiftDay(start,index),done=day<=today?[weights.has(day),sleep.has(day),journal.has(day)].filter(Boolean).length:0;return {day,done,recorded:day<=today&&(done>0||other.has(day)),today:day===today};});
}
export function receiptTitle(input:FocusTurnInput){
 if(!input.actions.length)return {title:'Запись сохранена',value:''};
 const kinds=new Set(input.actions.map(a=>a.kind));
 if(kinds.size!==1)return {title:'Запись сохранена',value:`Сохранено записей: ${input.actions.length}`};
 const action=input.actions[0];
 if(action.kind==='weight')return {title:'Вес записан',value:`${action.kg.toLocaleString('ru-RU')} кг`};
 if(action.kind==='expense')return {title:action.amountCents===null?'Расход ждёт уточнения':'Расход записан',value:action.amountCents===null?'Добавь сумму в дневнике':money(input.actions.reduce((sum,a)=>sum+(a.kind==='expense'?a.amountCents??0:0),0))};
 if(action.kind==='saving')return {title:action.direction==='in'?'В накоплениях стало больше':'Снятие записано',value:money(action.amountCents)};
 if(action.kind==='sleep')return {title:'Сон записан',value:action.minutes?`${Math.floor(action.minutes/60)} ч ${action.minutes%60?`${action.minutes%60} мин`:''}`.trim():`${action.start} → ${action.end}`};
 if(action.kind==='food'||action.kind==='recipe')return {title:'Еда записана',value:input.actions.length===1&&action.kind==='food'?action.name:`Позиций: ${input.actions.length}`};
 if(action.kind==='activity')return {title:'Активность записана',value:action.title};
 if(!action)return {title:'Запись сохранена',value:''};
 return {title:'Исправления сохранены',value:''};
}

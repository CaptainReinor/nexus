import {useState} from 'react';
import type {FocusAPI} from '../shared/focus-mode';
import {labelDraftSchema,type LabelDraft} from '../shared/focus-label';
import {prepareLabelPhoto} from './label-photo';
import {askConfirm} from './confirm';
import {errorText} from './ui';
export function FocusLabelPanel({api,busy,onBusy,onSaved}:{api:FocusAPI;busy:boolean;onBusy:(value:boolean)=>void;onSaved:()=>Promise<void>}){
 const [draft,setDraft]=useState<LabelDraft|null>(null),[working,setWorking]=useState(false),[message,setMessage]=useState('');
 async function scan(file:File){setWorking(true);onBusy(true);setMessage('');try{
  const image=await prepareLabelPhoto(file);let result:LabelDraft;
  try{result=await api.scanLabel({image});}catch(error){if(!errorText(error).includes('AI_BUDGET_CONFIRM')||!await askConfirm('Продолжить распознавание этикетки?'))throw error;result=await api.scanLabel({image,overrideBudget:true});}
  setDraft(result);
 }catch(error){setMessage(errorText(error));}finally{setWorking(false);onBusy(false);}}
 async function save(){if(!draft)return;setWorking(true);onBusy(true);setMessage('');try{const checked=labelDraftSchema.safeParse(draft);if(!checked.success)throw Error('Проверьте массу и значения на этикетке.');await api.saveLabel({draft:checked.data});setDraft(null);await onSaved();setMessage('Продукт сохранён.');}catch(error){setMessage(errorText(error));}finally{setWorking(false);onBusy(false);}}
 const number=(key:'basisGrams'|'kcal'|'proteinG'|'fatG'|'carbsG'|'sugarG'|'fiberG',label:string)=>draft&&<label>{label}<input type="number" min="0" step="any" value={draft[key]??''} disabled={working} onChange={e=>setDraft({...draft,[key]:e.target.value?Number(e.target.value):null})}/></label>;
 return <div className="focus-label-panel"><label className={`button secondary small focus-photo-button ${busy?'disabled':''}`}>Фото этикетки<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void scan(file);}}/></label>{working&&<span role="status">Читаю этикетку…</span>}
 {draft&&<form className="focus-label-form" onSubmit={e=>{e.preventDefault();void save();}}><div className="focus-label-fields"><label>Продукт<input value={draft.name} disabled={working} maxLength={300} onChange={e=>setDraft({...draft,name:e.target.value})}/></label><label>Бренд<input value={draft.brand} disabled={working} maxLength={100} onChange={e=>setDraft({...draft,brand:e.target.value})}/></label>{number('basisGrams','На, г')}{number('kcal','Ккал')}{number('proteinG','Белки, г')}{number('fatG','Жиры, г')}{number('carbsG','Углеводы, г')}</div><details><summary>Дополнительно</summary><div className="focus-label-fields">{number('sugarG','Сахар, г')}{number('fiberG','Клетчатка, г')}<label>Состояние<select value={draft.preparation} disabled={working} onChange={e=>setDraft({...draft,preparation:e.target.value as LabelDraft['preparation']})}><option value="unknown">Не указано</option><option value="raw">До приготовления</option><option value="cooked">Готовый продукт</option><option value="mixed">Блюдо</option></select></label></div></details>{draft.note&&<small>{draft.note}</small>}<div className="focus-actions"><button className="button primary small" disabled={working||!draft.name.trim()||!draft.basisGrams}>Сохранить продукт</button><button type="button" className="button ghost small" disabled={working} onClick={()=>setDraft(null)}>Закрыть</button></div></form>}{message&&<span role="status">{message}</span>}</div>;
}

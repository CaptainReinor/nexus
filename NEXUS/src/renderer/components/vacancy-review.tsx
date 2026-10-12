import {useState} from 'react';
import {vacancyFields,vacancyLabels,type VacancyField} from '../../shared/vacancy';
import type {VacancyDraft} from '../../shared/models';
export function VacancyReview({draft,onApply,onClose}:{draft:VacancyDraft;onApply:(fields:VacancyField[])=>void;onClose:()=>void}){
 const found=vacancyFields.filter(field=>draft[field]!==null),[selected,setSelected]=useState<VacancyField[]>(found);
 return <section className="vacancy-review"><h3>Результат разбора</h3>{found.length?<div className="form-grid two">{found.map(field=><label key={field} className="vacancy-review-field"><input type="checkbox" checked={selected.includes(field)} onChange={e=>setSelected(current=>e.target.checked?[...current,field]:current.filter(item=>item!==field))}/><span><small>{vacancyLabels[field]}</small><strong>{typeof draft[field]==='number'?draft[field].toLocaleString('ru-RU'):draft[field]}</strong></span></label>)}</div>:<p>Поля вакансии не найдены.</p>}<div className="button-row"><button type="button" className="button secondary small" disabled={!selected.length} onClick={()=>onApply(selected)}>Заполнить поля</button><button type="button" className="button ghost small" onClick={onClose}>Закрыть</button></div></section>;
}

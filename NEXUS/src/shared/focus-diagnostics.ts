import {z} from './validation';
import {records,put} from './daily-core';
import type {Snapshot} from './snapshot-sync';

export const focusDiagnosticKey='_focusDiagnostics';
export type FocusDiagnostic={id:string;at:string;stage:'provider'|'validation'|'save';model:string;requestId:string;day:string;text:string;response:string;attempt:number;issues:{path:string;code:string;message:string}[]};
const scrub=(text:string)=>text.replace(/sk-(?:or-v1-|or-admin-|or-provisioning-)?[A-Za-z0-9_-]{12,}/g,'[ключ скрыт]').replace(/Bearer\s+[^\s"']+/gi,'Bearer [скрыто]');
export function diagnosticIssues(error:unknown):FocusDiagnostic['issues']{
 if(error instanceof z.ZodError)return error.issues.slice(0,20).map(issue=>({path:issue.path.map(String).join('.'),code:issue.code,message:scrub(issue.message).slice(0,300)}));
 if(error instanceof FocusActionError)return error.issues;
 return [{path:'',code:error instanceof SyntaxError?'invalid_json':error instanceof Error?error.name:'unknown',message:scrub(error instanceof Error?error.message:String(error)).slice(0,500)}];
}
export class FocusActionError extends Error{
 constructor(public issues:FocusDiagnostic['issues']){super(issues[0]?.message??'Не удалось сопоставить исправление с записью.');this.name='FocusActionError';}
}
export function focusDiagnostic(input:Omit<FocusDiagnostic,'id'|'at'|'issues'>,error:unknown):FocusDiagnostic{return {...input,id:crypto.randomUUID(),at:new Date().toISOString(),model:scrub(input.model).slice(0,120),text:scrub(input.text).slice(0,16000),response:scrub(input.response).slice(0,24000),issues:diagnosticIssues(error)};}
export function readFocusDiagnostics(s:Snapshot):FocusDiagnostic[]{try{const value=JSON.parse(String(s.tables.settings?.find(r=>r.key===focusDiagnosticKey)?.value??'[]'));return Array.isArray(value)?value:[];}catch{return [];}}
export function recordFocusDiagnostic(s:Snapshot,value:FocusDiagnostic){
 const cutoff=Date.now()-30*86400000;let rows=[...readFocusDiagnostics(s).filter(r=>Date.parse(r.at)>=cutoff&&r.id!==value.id),value].slice(-20);
 while(JSON.stringify(rows).length>256000&&rows.length>1)rows=rows.slice(1);
 records(s,'settings');put(s,'settings',{key:focusDiagnosticKey,value:JSON.stringify(rows)},'key');
}

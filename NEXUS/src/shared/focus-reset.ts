import {z} from './validation';
import {localDay} from './domain';
import {put} from './daily-core';
import type {Snapshot} from './snapshot-sync';

export const focusResetKey='_nexus_focus_reset';
export const resetFocusTables=['focus_weights','focus_sleep','focus_money','mentor_turns','food_entries','activity_entries','focus_products','focus_recipes'] as const;
const markerSchema=z.object({id:z.string().uuid(),at:z.number().int().positive().safe(),day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict();
export const focusResetRequestSchema=markerSchema.extend({confirmation:z.literal('DELETE_FOCUS_RECORDS')}).strict();
export type FocusResetRequest=z.infer<typeof focusResetRequestSchema>;
type Marker=z.infer<typeof markerSchema>;
export function readFocusReset(s:Snapshot):Marker|null{try{return markerSchema.parse(JSON.parse(String(s.tables.settings?.find(r=>r.key===focusResetKey)?.value)));}catch{return null;}}
const compare=(a:Marker,b:Marker)=>a.at-b.at||a.id.localeCompare(b.id);
const boundary=(m:Marker)=>JSON.stringify({day:m.day,at:new Date(m.at).toISOString()});
function apply(s:Snapshot,m:Marker){
 for(const table of resetFocusTables)s.tables[table]=[];
 // These describe past portions, exports and diagnostic excerpts, not preferences.
 s.tables.settings=(s.tables.settings??[]).filter(r=>!['focusFoodEdits','focusExports','_focusDiagnostics'].includes(String(r.key)));
 put(s,'settings',{key:focusResetKey,value:JSON.stringify(m)},'key');
 put(s,'settings',{key:'focusBoundary',value:boundary(m)},'key');
}
export function makeFocusResetRequest(now=new Date()):FocusResetRequest{return {id:crypto.randomUUID(),at:now.getTime(),day:localDay(now),confirmation:'DELETE_FOCUS_RECORDS'};}
export function resetFocusRecords(s:Snapshot,raw:FocusResetRequest){
 const input=focusResetRequestSchema.parse(raw);if(input.at>Date.now()+86_400_000)throw Error('Проверь дату и время на устройстве.');
 const marker={id:input.id,at:input.at,day:input.day},previous=readFocusReset(s);
 if(previous&&compare(previous,marker)>=0)return;
 apply(s,marker);
}
/** A stale/offline snapshot belongs to the diary before the reset, even if it has newer edit clocks. */
export function alignFocusReset(base:Snapshot,local:Snapshot,remote:Snapshot){
 const winner=[readFocusReset(base),readFocusReset(local),readFocusReset(remote)].filter((m):m is Marker=>m!==null).sort(compare).at(-1);
 if(!winner)return {base,local,remote,marker:null};
 const normalize=(s:Snapshot)=>{if(readFocusReset(s)?.id===winner.id)return s;const next=structuredClone(s);apply(next,winner);return next;};
 return {base:normalize(base),local:normalize(local),remote:normalize(remote),marker:winner};
}
export function preserveFocusReset(s:Snapshot,m:Marker|null){if(m){put(s,'settings',{key:focusResetKey,value:JSON.stringify(m)},'key');put(s,'settings',{key:'focusBoundary',value:boundary(m)},'key');}}
export function focusResetHeaders(s:Snapshot):Record<string,string>{const marker=readFocusReset(s);return marker?{'X-Nexus-Focus-Reset':marker.id}:{};}

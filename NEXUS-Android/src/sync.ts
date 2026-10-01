import { remoteProfileSchema,normalizeInvitationToken } from '../../NEXUS/src/shared/accounts';
import { syncStateSchema } from '../../NEXUS/src/shared/sync-state';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { OfflineSync, RevisionConflict, type Snapshot, type State } from './offline-sync';
import { localStore } from './local-store';
import { watchRevisions } from '../../NEXUS/src/shared/revision-events';
export type { Row, Snapshot, State } from './offline-sync';
interface NativeAI {run(options:Record<string,unknown>):Promise<AIReply>;check(options:Record<string,unknown>):Promise<{configured:boolean}>;}
const nativeAI=registerPlugin<NativeAI>('NexusAI');

import type { Row } from './offline-sync';

const defaultEndpoint='';
const endpointKey='nexus.server.endpoint';
const tokenKey='nexus.server.token';
const roleKey='nexus.server.role';
export function usesGuestModelPreset(){return !!connection().token&&localStorage.getItem(roleKey)!=='owner';}

export function connection(){return {endpoint:localStorage.getItem(endpointKey)??defaultEndpoint,token:localStorage.getItem(tokenKey)??''};}
export async function saveConnection(endpoint:string,token:string){
  if(token.trim().startsWith('{')){
    let invite:unknown;try{invite=JSON.parse(token);}catch{throw new Error('Код приглашения повреждён.');}
    const parsed=invite as Record<string,unknown>;
    if(parsed.format!=='nexus-invite'||parsed.version!==1||typeof parsed.endpoint!=='string'||typeof parsed.token!=='string')throw new Error('Неверный формат приглашения.');
    endpoint=parsed.endpoint;token=parsed.token;
  }
  token=normalizeInvitationToken(token);
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Нужен адрес HTTPS без логина и параметров.');
  if(token.trim().length<32)throw new Error('Ключ доступа слишком короткий.');
  const response=await request('/v1/profile',{},20_000,{endpoint:`${url.origin}${url.pathname.replace(/\/+$/,'')}`,token:token.trim()});
  if(!response.ok)throw new Error('Не удалось проверить профиль.');
  const profile=remoteProfileSchema.parse(await response.json());
  localStorage.setItem(roleKey,profile.role);
  localStorage.setItem(endpointKey,`${url.origin}${url.pathname.replace(/\/+$/,'')}`);
  localStorage.setItem(tokenKey,token.trim());
}

async function request(path:string,options:RequestInit={},timeout=20_000,config=connection()):Promise<Response>{
  const {endpoint,token}=config;
  if(!token)throw new Error('Сначала подключите сервер.');
  let response:Response;
  try{response=await fetch(`${endpoint}${path}`,{...options,headers:{Authorization:`Bearer ${token}`,'Cache-Control':'no-store',...options.headers},redirect:'error',signal:AbortSignal.timeout(timeout)});}
  catch{throw new Error('Нет связи с сервером. Проверьте интернет.');}
  if(response.status===401||response.status===403)throw new Error('Сервер не принял ключ доступа.');
  return response;
}

async function aiError(response:Response):Promise<Error>{
  let detail:{status?:number;message?:string}={};try{detail=await response.json();}catch{/* nginx may return HTML */}
  const code=detail.status??response.status;
  const message=code===402?'Недостаточно средств или лимита API-ключа OpenRouter.':code===403?'OpenRouter запретил запрос с VPS. Обновите сервер и Android, чтобы подключаться с телефона.':code===401?'OpenRouter отклонил API-ключ.':code===404?'Выбранная модель OpenRouter недоступна.':code===429?'OpenRouter ограничил запросы. Повторите позже.':`AI ответил с ошибкой ${code}.`;
  return new Error(message+(detail.message?` ${detail.message}`:''));
}

export type AIReply={content:string;requestId:string;inputTokens:number|null;outputTokens:number|null;costMicrousd:number|null};
export async function remoteProfile(){const response=await request('/v1/profile');if(!response.ok)throw new Error('Профиль недоступен.');const profile=remoteProfileSchema.parse(await response.json());localStorage.setItem(roleKey,profile.role);return profile;}
export async function aiStatus():Promise<boolean>{
  if(Capacitor.isNativePlatform())return (await nativeAI.check({...connection()})).configured;
  const response=await request('/v1/ai/status');
  if(!response.ok)throw new Error(`AI на сервере недоступен: ${response.status}.`);
  const result=await response.json() as {configured:boolean};
  return result.configured===true;
}
export async function aiComplete(model:string,system:string,user:string,structured:boolean,responseFormat?:Record<string,unknown>):Promise<AIReply>{
  if(Capacitor.isNativePlatform()){const config=connection();return nativeAI.run({...config,mode:'complete',model,system,user,structured,responseFormat});}
  const response=await request('/v1/ai/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,system,user,structured})},120_000);
  if(response.status===409)throw new Error('Сначала подключите AI на компьютере в разделе «Сервер и синхронизация».');
  if(!response.ok)throw await aiError(response);
  return response.json() as Promise<AIReply>;
}
export async function aiTranscribe(model:string,base64:string,format:'webm'|'wav'|'mp3'|'m4a'|'ogg'|'aac'|'flac'):Promise<AIReply>{
  if(Capacitor.isNativePlatform()){const config=connection();return nativeAI.run({...config,mode:'transcribe',model,base64,format});}
  const response=await request('/v1/ai/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,base64,format})},120_000);
  if(response.status===409)throw new Error('Сначала подключите AI на компьютере в разделе «Сервер и синхронизация».');
  if(!response.ok)throw await aiError(response);
  return response.json() as Promise<AIReply>;
}

export async function loadState(config=connection()):Promise<State>{
  const response=await request('/v1/state',{},20_000,config);
  if(!response.ok)throw new Error(`Сервер ответил с ошибкой ${response.status}.`);
  const state=syncStateSchema.parse(await response.json());
  if(!Number.isSafeInteger(state.revision)||state.revision<0)throw new Error('Ответ сервера повреждён.');
  if(state.snapshot&&state.snapshot.format!=='nexus-backup')throw new Error('Формат данных сервера неизвестен.');
  return state;
}

async function putState(updated:Snapshot,revision:number,config:ReturnType<typeof connection>):Promise<number>{
  const response=await request('/v1/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Nexus-Revision':String(revision)},body:JSON.stringify(updated)},20_000,config);
  if(response.status===409)throw new RevisionConflict();
  if(!response.ok)throw new Error(`Не удалось сохранить: сервер ответил ${response.status}.`);
  const result=await response.json() as {revision:number};
  if(!Number.isSafeInteger(result.revision)||result.revision<=revision)throw new Error('Некорректный ответ сервера.');
  return result.revision;
}

export async function mobileSync(){
  const config=connection();
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${config.endpoint}\n${config.token}`));
  const scope=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  const store=await localStore(scope);
  const engine=new OfflineSync({...store,load:()=>loadState(config),put:(snapshot,revision)=>putState(snapshot,revision,config)});
  let events:AbortController|null=null,stopped=false;
  const disconnect=()=>{events?.abort();events=null;};
  const connect=()=>{
    if(stopped||events||document.hidden||!navigator.onLine)return;
    events=new AbortController();
    void watchRevisions({...config,revision:value=>engine.notify(value),fallback:()=>void engine.refresh()},events.signal);
  };
  const resume=()=>{if(document.hidden||!navigator.onLine)disconnect();else{void engine.refresh().then(()=>engine.flush());connect();}};
  document.addEventListener('visibilitychange',resume);window.addEventListener('online',resume);window.addEventListener('offline',disconnect);
  const lifecycle=Capacitor.isNativePlatform()?await registerPlugin<{addListener(event:string,listener:(state:{active:boolean})=>void):Promise<{remove():Promise<void>}>}>('NexusLocalStore').addListener('appStateChange',({active})=>{if(!active)disconnect();else resume();}):null;
  return {engine,start:async()=>{await engine.start();connect();},dispose:()=>{stopped=true;disconnect();engine.stop();document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);window.removeEventListener('offline',disconnect);void lifecycle?.remove();}};
}

export function rows(snapshot:Snapshot,name:string):Row[]{return snapshot.tables[name]??[];}
export function nextId(_items:Row[]):number{const bytes=crypto.getRandomValues(new Uint32Array(2));return (bytes[0]&0xffff)*4294967296+bytes[1]||1;}
export function upsert(items:Row[],record:Row,key='id'):void{
  const index=items.findIndex(item=>item[key]===record[key]);
  if(index<0)items.push(record);else items[index]=record;
}
export function today():string{
  const now=new Date(),y=now.getFullYear(),m=String(now.getMonth()+1).padStart(2,'0'),d=String(now.getDate()).padStart(2,'0');
  return `${y}-${m}-${d}`;
}
export function money(cents:number,currency='RUB'):string{return new Intl.NumberFormat('ru-RU',{style:'currency',currency,maximumFractionDigits:2}).format(cents/100);}

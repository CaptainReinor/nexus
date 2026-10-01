import { Capacitor, registerPlugin } from '@capacitor/core';
import type { LocalEnvelope } from './offline-sync';
const storage=registerPlugin<{read(options:{scope:string}):Promise<{value:string|null}>;write(options:{scope:string;value:string}):Promise<void>}>('NexusLocalStore');
let webDatabase:Promise<IDBDatabase>|null=null;
function database(){
  if(!webDatabase)webDatabase=new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('nexus-local',1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  return webDatabase;
}
export async function localStore(scope:string){
  const write=async(value:LocalEnvelope)=>{
    const serialized=JSON.stringify(value);
    if(Capacitor.isNativePlatform()){await storage.write({scope,value:serialized});return;}
    const db=await database();await new Promise<void>((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(serialized,scope);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
  };
  const read=async():Promise<LocalEnvelope|null>=>{
    let value:string|null;
    if(Capacitor.isNativePlatform())value=(await storage.read({scope})).value;
    else{const db=await database();value=await new Promise<string|null>((resolve,reject)=>{const request=db.transaction('state').objectStore('state').get(scope);request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(request.error);});}
    if(!value)return null;
    const envelope=JSON.parse(value) as LocalEnvelope;
    if(!Number.isSafeInteger(envelope.base?.revision)||envelope.base.revision<0||envelope.local&&envelope.local.format!=='nexus-backup')throw new Error('Локальная база повреждена. Сохранённый файл не перезаписан.');
    return envelope;
  };
  return {read,write};
}

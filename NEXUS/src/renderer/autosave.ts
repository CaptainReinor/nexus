import { useEffect, useRef, useState } from 'react';

export type AutoSaveStatus = { state:'saved'|'saving'|'error'; error?:string };

type Entry = {
  revision:number;
  savedRevision:number;
  task:()=>Promise<unknown>;
  timer:ReturnType<typeof setTimeout>|null;
  running:Promise<void>|null;
  error:string|null;
};

export class AutoSaveQueue {
  private entries=new Map<string,Entry>();
  private listener:(status:AutoSaveStatus)=>void;

  constructor(listener:(status:AutoSaveStatus)=>void){this.listener=listener;}

  setListener(listener:(status:AutoSaveStatus)=>void):void {this.listener=listener;this.emit();}

  private emit():void {
    const entries=[...this.entries.values()];
    const failed=entries.find(entry=>entry.error);
    if(failed){this.listener({state:'error',error:failed.error??undefined});return;}
    this.listener({state:entries.some(entry=>entry.timer||entry.running||entry.revision>entry.savedRevision)?'saving':'saved'});
  }

  enqueue(key:string,task:()=>Promise<unknown>,delay=0):void {
    const entry=this.entries.get(key)??{revision:0,savedRevision:0,task,timer:null,running:null,error:null};
    entry.revision++;
    entry.task=task;
    entry.error=null;
    if(entry.timer)clearTimeout(entry.timer);
    entry.timer=delay>0?setTimeout(()=>{entry.timer=null;void this.persist(key);},delay):null;
    this.entries.set(key,entry);
    this.emit();
    if(delay===0)void this.persist(key);
  }

  private persist(key:string):Promise<void> {
    const entry=this.entries.get(key);
    if(!entry)return Promise.resolve();
    if(entry.timer){clearTimeout(entry.timer);entry.timer=null;}
    if(entry.running)return entry.running;
    if(entry.error)return Promise.resolve();
    const work=async()=>{
      while(entry.savedRevision<entry.revision){
        const revision=entry.revision,task=entry.task;
        try{await task();entry.savedRevision=revision;entry.error=null;}
        catch(error){entry.error=error instanceof Error?error.message:String(error);if(entry.revision===revision)break;}
        this.emit();
      }
    };
    entry.running=work().finally(()=>{entry.running=null;this.emit();if(!entry.error&&entry.savedRevision<entry.revision)void this.persist(key);});
    this.emit();
    return entry.running;
  }

  async flushAll():Promise<boolean> {
    await Promise.all([...this.entries.keys()].map(key=>this.persist(key)));
    return [...this.entries.values()].every(entry=>entry.savedRevision===entry.revision);
  }

  retry():void {
    for(const [key,entry] of this.entries)if(entry.error){entry.error=null;void this.persist(key);}
    this.emit();
  }

  dispose():void {
    this.listener=()=>{};
    for(const [key,entry] of this.entries)if(entry.timer){clearTimeout(entry.timer);entry.timer=null;void this.persist(key);}
  }
}

export function useAutoSave():{queue:AutoSaveQueue;status:AutoSaveStatus} {
  const [status,setStatus]=useState<AutoSaveStatus>({state:'saved'});
  const ref=useRef<AutoSaveQueue|null>(null);
  if(!ref.current)ref.current=new AutoSaveQueue(setStatus);
  useEffect(()=>{ref.current?.setListener(setStatus);return()=>ref.current?.dispose();},[]);
  return {queue:ref.current,status};
}

export function useAutosavedEditor<T extends {id?:number}>(value:T|null,queue:AutoSaveQueue,kind:string,persist:(value:T)=>Promise<unknown>,delay=450):void {
  const previous=useRef<{id:number;serialized:string}|null>(null);
  useEffect(()=>{
    if(!value?.id){previous.current=null;return;}
    const serialized=JSON.stringify(value);
    if(previous.current?.id!==value.id){previous.current={id:value.id,serialized};return;}
    if(previous.current.serialized===serialized)return;
    previous.current={id:value.id,serialized};
    queue.enqueue(`${kind}:${value.id}`,()=>persist(value),delay);
  },[value,queue,kind,persist,delay]);
}

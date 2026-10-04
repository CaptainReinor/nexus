import {retainedJournalInputs} from '../../NEXUS/src/shared/journal-retention';
import {ensureDaily} from '../../NEXUS/src/shared/daily-core';
import {materializePayments} from '../../NEXUS/src/shared/payments';
import {ensureFinanceOrder} from '../../NEXUS/src/shared/finance-order';
import {ensureGrowth,materializeRepeats} from '../../NEXUS/src/shared/growth';
import { mergeSnapshots,normalizeSleep,rowKey,sameSnapshot,type Snapshot,type State,type LocalEnvelope,type Conflict,type SyncStatus } from '../../NEXUS/src/shared/snapshot-sync';
import { readRecordClocks,recordTime,stampRecordChanges } from '../../NEXUS/src/shared/record-clocks';
export { mergeSnapshots,rowKey,sameSnapshot } from '../../NEXUS/src/shared/snapshot-sync';
export type { Row,Snapshot,State,LocalEnvelope,Conflict,SyncStatus } from '../../NEXUS/src/shared/snapshot-sync';
type Dependencies={load():Promise<State>;put(snapshot:Snapshot,revision:number):Promise<number>;read():Promise<LocalEnvelope|null>;write(value:LocalEnvelope):Promise<void>;delay?:number};
export class RevisionConflict extends Error{}

export class OfflineSync {
  private base:State={revision:0,snapshot:null};
  private local:Snapshot|null=null;
  private ready=false;
  private listeners=new Set<()=>void>();
  private saveTail:Promise<void>=Promise.resolve();
  private timer:ReturnType<typeof setTimeout>|null=null;
  private flight:Promise<void>|null=null;
  private requestedRevision=0;
  private stopped=false;
  status:SyncStatus='loading';
  error='';
  conflicts:Conflict[]=[];
  constructor(private deps:Dependencies){}
  get state():State{return {revision:this.base.revision,snapshot:this.local};}
  get pending():boolean{return !sameSnapshot(this.base.snapshot,this.local);}
  subscribe(listener:()=>void){this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
  private emit(){for(const listener of this.listeners)listener();}
  private setStatus(status:SyncStatus,error=''){this.status=status;this.error=error;this.emit();}
  private persist():Promise<void>{
    const value=structuredClone({base:this.base,local:this.local,conflicts:this.conflicts});
    const task=this.saveTail.catch(()=>{}).then(()=>this.deps.write(value));
    this.saveTail=task;
    return task.catch(error=>{this.setStatus('storage-error','Не удалось сохранить данные на телефоне. Освободите место и повторите.');throw error;});
  }
  async start(){
    const stored=await this.deps.read();
    if(stored){
      this.base=stored.base;this.local=stored.local;this.conflicts=stored.conflicts??[];this.ready=true;
      if(this.conflicts.length&&this.local&&this.base.snapshot){const left=readRecordClocks(this.local),right=readRecordClocks(this.base.snapshot);await this.resolve(Object.fromEntries(this.conflicts.map(conflict=>[`${conflict.table}:${conflict.key}`,recordTime(left,conflict.table,conflict.key,conflict.local)>recordTime(right,conflict.table,conflict.key,conflict.remote)?'local':'remote'])));}
      else this.setStatus(this.pending?'pending':'saved');
    }
    await this.refresh();
    if(this.local)await this.change(()=>{});
  }
  async change(change:(snapshot:Snapshot)=>void):Promise<void>{
    if(!this.ready||!this.local)throw new Error('Сначала загрузите данные с компьютера.');
    const next=structuredClone(this.local);change(next);
    for(const table of ['day_details','day_tasks','day_memories','assistant_reviews'])next.tables[table]??=[];
    ensureGrowth(next);ensureFinanceOrder(next);ensureDaily(next);materializeRepeats(next);materializePayments(next);
    next.tables.daily_journals=retainedJournalInputs(next.tables.daily_journals??[]);
    if(sameSnapshot(next,this.local)&&this.status!=='storage-error')return;
    stampRecordChanges(this.local,next,rowKey);
    next.exportedAt=new Date().toISOString();
    this.local=next;this.setStatus(this.conflicts.length?'conflict':'pending');
    await this.persist();this.schedule();
  }
  private accept(remote:State){
    if(this.local&&this.base.snapshot&&remote.snapshot&&this.pending){
      const merged=mergeSnapshots(this.base.snapshot,this.local,remote.snapshot);
      this.local=merged.snapshot;this.conflicts=merged.conflicts;
    }else if(!this.pending||!this.local){this.local=remote.snapshot;this.conflicts=[];}
    else if(!remote.snapshot)throw new Error('На сервере нет базы. Локальные изменения сохранены.');
    this.base=remote;this.ready=true;
    this.setStatus(this.conflicts.length?'conflict':this.pending?'pending':'saved');
  }
  async refresh():Promise<void>{
    if(this.flight)return this.flight;
    this.flight=(async()=>{
      try{const remote=await this.deps.load();this.accept(remote);await this.persist();}
      catch(error){if(this.status!=='storage-error')this.setStatus('offline',error instanceof Error?error.message:'Нет связи с сервером.');}
    })().finally(()=>{this.flight=null;if(this.requestedRevision>this.base.revision&&this.status!=='offline'){this.requestedRevision=0;void this.refresh();}else if(this.pending&&!this.conflicts.length)this.schedule(this.status==='offline'?30_000:450);});
    return this.flight;
  }
  notify(revision:number){
    if(revision<=this.base.revision)return;
    this.requestedRevision=Math.max(this.requestedRevision,revision);
    if(!this.flight)void this.refresh();
  }
  private schedule(delay=this.deps.delay??450){
    if(this.stopped||this.conflicts.length||this.status==='storage-error')return;
    if(this.timer)clearTimeout(this.timer);
    this.timer=setTimeout(()=>{this.timer=null;void this.flush();},delay);
  }
  async flush():Promise<void>{
    if(this.timer){clearTimeout(this.timer);this.timer=null;}
    if(this.flight)return this.flight;
    if(!this.pending||!this.local||this.conflicts.length||this.status==='storage-error')return;
    this.flight=(async()=>{
      await this.saveTail;
      try{
        for(let attempt=0;attempt<3&&this.pending&&!this.conflicts.length;attempt++){
          const snapshot=structuredClone(this.local!);
          this.setStatus('syncing');
          try{
            const revision=await this.deps.put(snapshot,this.base.revision);
            this.base={revision,snapshot};
            // The live snapshot already includes any edits made during this request.
            this.setStatus(this.pending?'pending':'saved');await this.persist();
          }catch(error){
            if(error instanceof RevisionConflict){this.accept(await this.deps.load());await this.persist();continue;}
            throw error;
          }
        }
      }catch(error){if(this.status!=='storage-error')this.setStatus('offline',error instanceof Error?error.message:'Нет связи с сервером.');}
    })().catch(()=>{}).finally(()=>{
      this.flight=null;
      if(this.requestedRevision>this.base.revision&&!this.conflicts.length){this.requestedRevision=0;void this.refresh();}
      else if(this.pending&&!this.conflicts.length)this.schedule(this.status==='offline'?30_000:450);
    });
    return this.flight;
  }
  async resolve(choices:Record<string,'local'|'remote'>){
    if(!this.local) return;
    const next=structuredClone(this.local);
    for(const conflict of this.conflicts){
      if(!choices[`${conflict.table}:${conflict.key}`])throw new Error('Выберите вариант для каждого изменения.');
      if(choices[`${conflict.table}:${conflict.key}`]!=='remote')continue;
      const list=next.tables[conflict.table]??[];
      const index=list.findIndex(row=>rowKey(conflict.table,row)===conflict.key);
      if(!conflict.remote){if(index>=0)list.splice(index,1);}
      else if(index<0)list.push(structuredClone(conflict.remote));
      else if(conflict.fields.includes('запись'))list[index]=structuredClone(conflict.remote);
      else for(const field of conflict.fields){if(conflict.remote[field]===undefined)delete list[index][field];else list[index][field]=conflict.remote[field];}
    }
    normalizeSleep(next,this.local);
    this.local=next;this.conflicts=[];this.setStatus(this.pending?'pending':'saved');await this.persist();this.schedule();
  }
  stop(){this.stopped=true;if(this.timer)clearTimeout(this.timer);this.timer=null;}
}

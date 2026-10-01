import { requireSecureStorage } from './secure-storage';
import { app, clipboard, safeStorage } from 'electron';
import { isStarterFinanceRow } from '../shared/finance-defaults';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync,readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import type { DB } from './database';
import { importBackupText, openDatabase, serializeBackup } from './database';
import { decryptBackup, encryptBackup } from './remote-crypto';
import { watchRevisions } from '../shared/revision-events';
import { mergeSnapshots,rowKey,type Snapshot,type State } from '../shared/snapshot-sync';
import { remoteProfileSchema,invitationCodeSchema,normalizeInvitationToken,type RemoteProfile,type UserInvitation } from '../shared/accounts';
import { syncStateSchema } from '../shared/sync-state';
import { OpenRouterManagement } from './openrouter-management';
import { recordClockSetting,stampRecordChanges } from '../shared/record-clocks';

const configSchema=z.object({endpoint:z.string().url(),token:z.string().min(32).max(512),passphrase:z.union([z.literal(''),z.string().min(16).max(256)]),lastUploadedHash:z.string().length(64).optional(),lastUploadedAt:z.string().datetime().optional(),lastSyncedHash:z.string().length(64).optional(),lastSyncedRevision:z.number().int().nonnegative().optional(),profileId:z.union([z.literal('owner'),z.string().uuid()]).optional()}).strict();
const infoSchema=z.object({id:z.string().uuid(),createdAt:z.string().datetime(),exportedAt:z.string().datetime(),size:z.number().int().nonnegative(),device:z.string().max(100)}).strict();
const stateSchema=syncStateSchema;
export type RemoteBackupInfo=z.infer<typeof infoSchema>;
export type RemoteBackupConfig={endpoint:string;configured:boolean;lastUploadedAt:string|null;lastSyncedRevision:number|null;autoError:string|null;encryptedCopiesEnabled:boolean};
class RemoteRevisionConflict extends Error{}

function cleanEndpoint(value:string):string {
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('Укажите адрес сервера HTTPS без логина и параметров.');
  const path=url.pathname.replace(/\/+$/,'');
  return `${url.origin}${path}`;
}

export class RemoteBackupService {
  private management=new OpenRouterManagement();
  managementStatus(){return this.management.status();}
  async setManagementKey(key:string){if((await this.profile())?.role!=='owner')throw new Error('Выдавать ключи может только владелец.');await this.management.setCredential(key);}
  private credentialsPath=join(app.getPath('userData'),'remote-backup-credentials.bin');
  private timer:ReturnType<typeof setInterval>|null=null;
  private inFlight:Promise<RemoteBackupInfo>|null=null;
  private syncInFlight:Promise<void>|null=null;
  private cycleInFlight=false;
  private syncError:string|null=null;
  private backupError:string|null=null;
  private retryAfter=0;
  private nextBackupAt=0;
  private syncRetryAfter=0;
  private events:AbortController|null=null;
  private changeTimer:ReturnType<typeof setTimeout>|null=null;
  private fallbackPolling=false;
  private eventRevision=0;
  private changeVersion=0;
  private basePath=join(app.getPath('userData'),'remote-sync-base.json');
  private observed:Snapshot;
  constructor(private db:DB,private onRemoteApplied:()=>void=()=>{}){this.observed=JSON.parse(serializeBackup(db)) as Snapshot;}

  private credentials():z.infer<typeof configSchema> {
    if(!existsSync(this.credentialsPath))throw new Error('Сначала настройте серверные копии.');
    requireSecureStorage();
    return configSchema.parse(JSON.parse(safeStorage.decryptString(readFileSync(this.credentialsPath))));
  }

  isGuest():boolean {
    if(!existsSync(this.credentialsPath))return false;
    const id=this.credentials().profileId;return !!id&&id!=='owner';
  }

  getConfig():RemoteBackupConfig {
    if(!existsSync(this.credentialsPath))return {endpoint:'',configured:false,lastUploadedAt:null,lastSyncedRevision:null,autoError:null,encryptedCopiesEnabled:false};
    const settings=this.credentials();
    return {endpoint:settings.endpoint,configured:true,lastUploadedAt:settings.lastUploadedAt??null,lastSyncedRevision:settings.lastSyncedRevision??null,autoError:this.syncError??this.backupError,encryptedCopiesEnabled:!!settings.passphrase};
  }

  copyPairingToken():void{
    clipboard.writeText(this.credentials().token);
  }

  setBackupPassphrase(passphrase:string):RemoteBackupConfig{
    if(this.inFlight||this.syncInFlight||this.cycleInFlight)throw new Error('Дождитесь завершения текущей синхронизации.');
    const settings=this.credentials();
    this.saveCredentials({...settings,passphrase:z.string().min(16).max(256).parse(passphrase),lastUploadedHash:undefined});
    this.nextBackupAt=0;this.retryAfter=0;this.backupError=null;
    return this.getConfig();
  }

  private saveCredentials(settings:z.infer<typeof configSchema>):void {
    requireSecureStorage();
    const temporaryPath=`${this.credentialsPath}.tmp`;
    try {
      writeFileSync(temporaryPath,safeStorage.encryptString(JSON.stringify(settings)),{mode:0o600});
      renameSync(temporaryPath,this.credentialsPath);
    } finally {rmSync(temporaryPath,{force:true});}
  }

  async profile():Promise<RemoteProfile|null>{
    if(!existsSync(this.credentialsPath))return null;
    return remoteProfileSchema.parse(JSON.parse(await this.request(this.credentials(),'/v1/profile',{method:'GET'},10000)));
  }
  async users():Promise<RemoteProfile[]>{
    const users=z.array(remoteProfileSchema).parse(JSON.parse(await this.request(this.credentials(),'/v1/users',{method:'GET'},100000)));
    if(this.management.status().configured)await Promise.all(users.map(async user=>{if(user.aiKeyHash)try{user.usedMicrousd=await this.management.usage(user.aiKeyHash);}catch{/* usage remains unavailable; never show a fabricated zero */}}));
    return users;
  }
  async createUser(input:{name:string;monthlyLimitCents:number}):Promise<UserInvitation>{
    const settings=this.credentials();
    if((await this.profile())?.role!=='owner')throw new Error('Приглашения создаёт владелец.');
    const aiCredentials=await this.management.create(input.name,input.monthlyLimitCents);
    try{
      const result=z.object({user:remoteProfileSchema,token:z.string().min(32).max(512),code:invitationCodeSchema.optional()}).parse(JSON.parse(await this.request(settings,'/v1/users',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,aiCredentials})},10000)));
      return {...result,endpoint:settings.endpoint};
    }catch(error){
      try{await this.management.disable(aiCredentials.hash);}catch{throw new Error('Приглашение не подтверждено. Не удалось отключить выданный ключ: проверьте ключи NEXUS в аккаунте OpenRouter.');}
      throw error;
    }
  }
  async invitation(id:string):Promise<UserInvitation>{
    const settings=this.credentials();
    const result=z.object({user:remoteProfileSchema,code:invitationCodeSchema}).parse(JSON.parse(await this.request(settings,`/v1/users/${encodeURIComponent(id)}/invitation`,{method:'POST'},10000)));
    return {...result,endpoint:settings.endpoint};
  }
  async updateUser(input:{id:string;active?:boolean;monthlyLimitCents?:number}):Promise<RemoteProfile>{
    const {id,...changes}=input;
    const user=(await this.users()).find(user=>user.id===id);
    if(!user)throw new Error('Пользователь не найден.');
    if(user.aiKeyHash)await this.management.update(user.aiKeyHash,changes);
    return remoteProfileSchema.parse(JSON.parse(await this.request(this.credentials(),`/v1/users/${encodeURIComponent(id)}`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(changes)},10000)));
  }
  async deviceAIKey():Promise<string>{return z.object({key:z.string().regex(/^sk-or-v1-[a-zA-Z0-9_-]{20,480}$/)}).parse(JSON.parse(await this.request(this.credentials(),'/v1/ai/device-key',{method:'GET'},2048))).key;}

  async configure(input:z.infer<typeof configSchema>):Promise<RemoteBackupConfig> {
    if(this.inFlight||this.syncInFlight||this.cycleInFlight)throw new Error('Дождитесь завершения текущей синхронизации.');
    if(input.token.trim().startsWith('{')){
      const invite=z.object({format:z.literal('nexus-invite'),version:z.literal(1),name:z.string(),endpoint:z.string().url(),token:z.string().min(32).max(512)}).strict().parse(JSON.parse(input.token));
      input={...input,endpoint:invite.endpoint,token:invite.token};
    }
    let settings=configSchema.parse({...input,token:normalizeInvitationToken(input.token),endpoint:cleanEndpoint(input.endpoint)});
    const identity=remoteProfileSchema.parse(JSON.parse(await this.request(settings,'/v1/profile',{method:'GET'},10000)));
    const old=existsSync(this.credentialsPath)?this.credentials():null;
    const same=old&&old.endpoint===settings.endpoint&&(old.profileId?old.profileId===identity.id:identity.id==='owner');
    const tables=(JSON.parse(serializeBackup(this.db)) as Snapshot).tables;
    const hasPersonalData=existsSync(join(app.getPath('userData'),'openrouter-key.bin'))||Object.entries(tables).some(([table,list])=>table!=='settings'&&list.some(row=>!isStarterFinanceRow(table,row)));
    if(old&&!same||!old&&identity.role==='guest'&&hasPersonalData)throw new Error('Этот профиль содержит данные другого пользователя. Нельзя подключить другой доступ к этой базе. Сначала экспортируйте свои данные.');
    settings=configSchema.parse({...same?old:{},...settings,passphrase:settings.passphrase||(same?old.passphrase:''),profileId:identity.id});
    requireSecureStorage();
    z.array(infoSchema).parse(JSON.parse(await this.request(settings,'/v1/backups',{method:'GET'},1_000_000)));
    this.saveCredentials(settings);
    this.syncError=null;
    this.backupError=null;
    this.retryAfter=0;
    this.syncRetryAfter=0;
    if(this.timer){this.connectEvents();this.notifyLocalChange();}
    return this.getConfig();
  }

  startAutoUpload():void {
    if(this.timer)return;
    const tick=(initial=false)=>{if(this.cycleInFlight)return;this.cycleInFlight=true;void (async()=>{
      if(initial||this.fallbackPolling||this.syncError)await this.runSync();
      try{await this.uploadIfChanged();}catch(error){this.backupError=error instanceof Error?error.message:'Не удалось загрузить автоматическую копию.';this.retryAfter=Date.now()+60_000;}
      this.cycleInFlight=false;
    })();};
    this.timer=setInterval(()=>tick(),60_000);
    this.connectEvents();tick(true);
  }

  stopAutoUpload():void {if(this.timer)clearInterval(this.timer);this.timer=null;this.events?.abort();this.events=null;if(this.changeTimer)clearTimeout(this.changeTimer);this.changeTimer=null;}

  private connectEvents():void {
    this.events?.abort();this.events=null;this.fallbackPolling=false;this.eventRevision=0;
    if(!existsSync(this.credentialsPath))return;
    const settings=this.credentials();this.events=new AbortController();
    void watchRevisions({...settings,revision:revision=>{
      this.fallbackPolling=false;
      if(revision>(this.credentials().lastSyncedRevision??0)){this.eventRevision=Math.max(this.eventRevision,revision);void this.runSync();}
    },fallback:()=>{this.fallbackPolling=true;void this.runSync();}},this.events.signal);
  }

  private async runSync():Promise<void>{
    const version=this.changeVersion;
    try{await this.sync();}catch(error){this.syncError=error instanceof Error?error.message:'Не удалось синхронизировать данные.';this.syncRetryAfter=Date.now()+60_000;}
    if(!this.syncError&&(version!==this.changeVersion||this.eventRevision>(existsSync(this.credentialsPath)?this.credentials().lastSyncedRevision??0:0))){
      this.eventRevision=0;this.notifyLocalChange();
    }
  }

  notifyLocalChange():void {
    if(!this.timer)return;
    const current=JSON.parse(serializeBackup(this.db)) as Snapshot;
    stampRecordChanges(this.observed,current,rowKey);
    const clock=current.tables.settings.find(row=>row.key===recordClockSetting);
    if(clock)this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(clock.key,clock.value);
    this.observed=current;
    this.changeVersion++;
    if(this.changeTimer)clearTimeout(this.changeTimer);
    this.changeTimer=setTimeout(()=>{this.changeTimer=null;void this.runSync();},500);
  }

  private async request(settings:z.infer<typeof configSchema>,path:string,options:RequestInit,limit=32_000_000,timeout=30_000):Promise<string> {
    let response:Response;
    try {
      response=await fetch(`${settings.endpoint}${path}`,{...options,headers:{Authorization:`Bearer ${settings.token}`,'Cache-Control':'no-store',...options.headers},redirect:'error',signal:AbortSignal.timeout(timeout)});
    } catch {throw new Error('Не удалось связаться с сервером копий по HTTPS.');}
    if(response.status===401||response.status===403)throw new Error('Сервер не принял ключ доступа.');
    if(path==='/v1/state'&&response.status===409)throw new RemoteRevisionConflict();
    if(!response.ok){
      if(response.status===402)throw new Error('Исчерпан месячный лимит общего AI.');
      if(response.status===426)throw new Error('Обновите NEXUS: сервер содержит данные более новой версии.');
      if(response.status===429)throw new Error('Предыдущий запрос AI ещё обрабатывается.');
      throw new Error(`Сервер ответил с ошибкой ${response.status}.`);
    }
    const length=Number(response.headers.get('content-length')??0);
    if(length>limit)throw new Error('Ответ сервера слишком большой.');
    const reader=response.body?.getReader();
    if(!reader)throw new Error('Сервер вернул пустой ответ.');
    const chunks:Uint8Array[]=[];
    let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new Error('Ответ сервера слишком большой.');}chunks.push(value);}
    return Buffer.concat(chunks).toString('utf8');
  }

  async list():Promise<RemoteBackupInfo[]> {
    const settings=this.credentials();
    return z.array(infoSchema).parse(JSON.parse(await this.request(settings,'/v1/backups',{method:'GET'},1_000_000)));
  }

  async enableAndroidAI(key:string):Promise<void> {
    const settings=this.credentials();
    await this.request(settings,'/v1/ai/key',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({key})},1000);
  }

  async upload():Promise<RemoteBackupInfo> {
    if(this.inFlight)return this.inFlight;
    const snapshot=serializeBackup(this.db);
    return this.uploadSnapshot(snapshot,this.snapshotHash(snapshot));
  }

  private snapshotHash(snapshot:string):string {
    const tables=(JSON.parse(snapshot) as {tables:Record<string,Record<string,unknown>[]>}).tables;
    for(const name of ['investment_accounts','investment_entries','day_details','day_tasks','day_memories','assistant_reviews'])if(tables[name]?.length===0)delete tables[name];
    const canonical=Object.fromEntries(Object.keys(tables).sort().map(name=>[name,tables[name].map(row=>JSON.stringify(Object.fromEntries(Object.keys(row).sort().map(key=>[key,row[key]])))).sort()]));
    return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  }

  private migrateHashes(snapshot:string):void {
    const settings=this.credentials(),tables=(JSON.parse(snapshot) as {tables:Record<string,unknown[]>}).tables;
    for(const name of ['investment_accounts','investment_entries','day_details','day_tasks','day_memories','assistant_reviews'])if(tables[name]?.length===0)delete tables[name];
    const legacy=createHash('sha256').update(JSON.stringify(tables)).digest('hex'),canonical=this.snapshotHash(snapshot);
    if(settings.lastSyncedHash===legacy||settings.lastUploadedHash===legacy)this.saveCredentials({...settings,lastSyncedHash:settings.lastSyncedHash===legacy?canonical:settings.lastSyncedHash,lastUploadedHash:settings.lastUploadedHash===legacy?canonical:settings.lastUploadedHash});
  }

  private scope(settings:z.infer<typeof configSchema>):string{return createHash('sha256').update(`${settings.endpoint}\n${settings.token}`).digest('hex');}

  private legacyHash(snapshot:Snapshot):string{
    const tables=structuredClone(snapshot.tables);
    for(const name of ['investment_accounts','investment_entries','day_details','day_tasks','day_memories','assistant_reviews'])if(tables[name]?.length===0)delete tables[name];
    return createHash('sha256').update(JSON.stringify(tables)).digest('hex');
  }

  private remember(settings:z.infer<typeof configSchema>,state:State):void{
    const temporary=`${this.basePath}.tmp`;
    try{writeFileSync(temporary,JSON.stringify({scope:this.scope(settings),state}),{mode:0o600});renameSync(temporary,this.basePath);}
    finally{rmSync(temporary,{force:true});}
  }

  private async commonBase(settings:z.infer<typeof configSchema>,remote:State):Promise<Snapshot|null>{
    const matches=(snapshot:Snapshot)=>this.snapshotHash(JSON.stringify(snapshot))===settings.lastSyncedHash||this.legacyHash(snapshot)===settings.lastSyncedHash;
    if(existsSync(this.basePath))try{
      const cached=z.object({scope:z.string(),state:stateSchema}).parse(JSON.parse(readFileSync(this.basePath,'utf8')));
      if(cached.scope===this.scope(settings)&&cached.state.snapshot&&matches(cached.state.snapshot))return cached.state.snapshot;
    }catch{/* Keep the original file and recover from authenticated copies. */}
    if(remote.snapshot&&remote.revision===settings.lastSyncedRevision)return remote.snapshot;
    if(!settings.lastSyncedHash)return null;
    // Releases before 0.2.5 stored only a hash. Recover its exact snapshot once.
    if(!settings.passphrase)return null;
    const copies=await this.list();
    for(const copy of copies){
      try{
        const envelope=await this.request(settings,`/v1/backups/${encodeURIComponent(copy.id)}`,{method:'GET'});
        const state=stateSchema.parse({revision:settings.lastSyncedRevision??0,snapshot:JSON.parse(decryptBackup(JSON.parse(envelope),settings.passphrase))});
        if(state.snapshot&&matches(state.snapshot)){this.remember(settings,state);return state.snapshot;}
      }catch{/* Another copy may use an older phrase or schema. */}
    }
    return null;
  }

  private validateSnapshot(snapshot:Snapshot):void{
    const temporary=openDatabase(':memory:');
    try{importBackupText(temporary,JSON.stringify(snapshot));}finally{temporary.close();}
  }

  private sync():Promise<void> {
    if(this.syncInFlight)return this.syncInFlight;
    if(!existsSync(this.credentialsPath)||Date.now()<this.syncRetryAfter)return Promise.resolve();
    this.syncInFlight=this.performSync().finally(()=>{this.syncInFlight=null;});
    return this.syncInFlight;
  }

  syncNow():Promise<void>{return this.sync();}

  private async performSync(attempt=0):Promise<void> {
    this.migrateHashes(serializeBackup(this.db));
    const settings=this.credentials();
    const localSnapshot=serializeBackup(this.db),localHash=this.snapshotHash(localSnapshot);
    const remote=stateSchema.parse(JSON.parse(await this.request(settings,'/v1/state',{method:'GET'},14_000_000)));
    const remoteHash=remote.snapshot?this.snapshotHash(JSON.stringify(remote.snapshot)):null;
    const fresh=this.credentials();
    if(fresh.endpoint!==settings.endpoint||fresh.token!==settings.token)return;
    if(remoteHash===localHash){
      if(fresh.lastSyncedHash!==localHash||fresh.lastSyncedRevision!==remote.revision)
        this.saveCredentials({...fresh,lastSyncedHash:localHash,lastSyncedRevision:remote.revision});
      this.remember(fresh,remote);
      this.syncError=null;this.syncRetryAfter=0;return;
    }
    if(remote.snapshot&&fresh.lastSyncedHash===localHash){
      if(this.snapshotHash(serializeBackup(this.db))!==localHash)return;
      await this.safetyCopy();
      if(this.snapshotHash(serializeBackup(this.db))!==localHash)return;
      importBackupText(this.db,JSON.stringify(remote.snapshot));
      this.saveCredentials({...fresh,lastSyncedHash:remoteHash!,lastSyncedRevision:remote.revision});
      this.remember(fresh,remote);this.observed=JSON.parse(serializeBackup(this.db)) as Snapshot;
      this.syncError=null;this.syncRetryAfter=0;
      this.onRemoteApplied();
      return;
    }
    const local=JSON.parse(localSnapshot) as Snapshot;
    let outgoing=local;
    if(remote.snapshot){
      const base=await this.commonBase(fresh,remote);
      // Without legacy history, preserve independent records and use edit clocks
      // for overlapping records. A missing row alone never proves a deletion.
      outgoing=mergeSnapshots(base??{...local,tables:Object.fromEntries(Object.keys(local.tables).map(name=>[name,[]]))},local,remote.snapshot).snapshot;
    }
    outgoing.exportedAt=new Date().toISOString();this.validateSnapshot(outgoing);
    const body=JSON.stringify(outgoing);
    if(Buffer.byteLength(body)>12_000_000)throw new Error('База слишком велика для синхронизации.');
    await this.safetyCopy();
    if(this.snapshotHash(serializeBackup(this.db))!==localHash)return;
    let revision=remote.revision;
    if(this.snapshotHash(body)!==remoteHash)try{
      const response=z.object({revision:z.number().int().positive()}).parse(JSON.parse(await this.request(settings,'/v1/state',{method:'PUT',headers:{'Content-Type':'application/json','X-Nexus-Revision':String(remote.revision)},body},1_000_000)));
      revision=response.revision;
    }catch(error){if(error instanceof RemoteRevisionConflict&&attempt<3)return this.performSync(attempt+1);throw error;}
    const current=this.credentials();
    if(current.endpoint!==settings.endpoint||current.token!==settings.token)return;
    const latest=JSON.parse(serializeBackup(this.db)) as Snapshot;
    const applied=mergeSnapshots(local,latest,outgoing).snapshot;
    this.validateSnapshot(applied);
    const applyHash=this.snapshotHash(JSON.stringify(applied));
    if(applyHash!==this.snapshotHash(JSON.stringify(latest))){
      this.safetyJson(latest);
      importBackupText(this.db,JSON.stringify(applied));
    }
    this.saveCredentials({...current,lastSyncedHash:this.snapshotHash(body),lastSyncedRevision:revision});
    this.remember(current,{revision,snapshot:outgoing});this.observed=JSON.parse(serializeBackup(this.db)) as Snapshot;
    this.syncError=null;this.syncRetryAfter=0;
    if(applyHash!==this.snapshotHash(JSON.stringify(latest)))this.onRemoteApplied();
    if(applyHash!==this.snapshotHash(body))this.notifyLocalChange();
  }

  private async uploadIfChanged():Promise<void> {
    if(this.inFlight||this.syncInFlight||this.syncError||!existsSync(this.credentialsPath)||Date.now()<this.retryAfter||Date.now()<this.nextBackupAt)return;
    const snapshot=serializeBackup(this.db),hash=this.snapshotHash(snapshot);
    if(!this.credentials().passphrase||this.credentials().lastUploadedHash===hash)return;
    await this.uploadSnapshot(snapshot,hash);
  }

  private uploadSnapshot(snapshot:string,hash:string):Promise<RemoteBackupInfo> {
    if(this.inFlight)return this.inFlight;
    this.inFlight=this.sendSnapshot(snapshot,hash).finally(()=>{this.inFlight=null;});
    return this.inFlight;
  }

  private async sendSnapshot(snapshot:string,hash:string):Promise<RemoteBackupInfo> {
    const settings=this.credentials();
    if(!settings.passphrase)throw new Error('Сначала задайте пароль для резервных копий.');
    const envelope=encryptBackup(snapshot,settings.passphrase);
    const body=JSON.stringify(envelope);
    if(Buffer.byteLength(body)>28_000_000)throw new Error('Копия слишком велика для загрузки.');
    const text=await this.request(settings,'/v1/backups',{method:'POST',headers:{'Content-Type':'application/json'},body},1_000_000);
    const uploaded=infoSchema.parse(JSON.parse(text));
    const current=this.credentials();
    if(current.endpoint===settings.endpoint&&current.token===settings.token&&current.passphrase===settings.passphrase)
      this.saveCredentials({...current,lastUploadedHash:hash,lastUploadedAt:uploaded.createdAt});
    this.backupError=null;
    this.retryAfter=0;
    this.nextBackupAt=Date.now()+5*60_000;
    return uploaded;
  }

  private safetyDirectory():string{const directory=join(app.getPath('userData'),'sync-safety');mkdirSync(directory,{recursive:true});return directory;}
  private trimSafety():void{
    const directory=this.safetyDirectory();
    for(const extension of ['sqlite','json']){
      const files=readdirSync(directory).filter(name=>/^sync-\d+\.(sqlite|json)$/.test(name)&&name.endsWith(`.${extension}`)).sort((a,b)=>Number(b.split('-')[1].split('.')[0])-Number(a.split('-')[1].split('.')[0]));
      for(const file of files.slice(5))rmSync(join(directory,file),{force:true});
    }
  }
  private async safetyCopy():Promise<void>{await this.db.backup(join(this.safetyDirectory(),`sync-${Date.now()}.sqlite`));this.trimSafety();}
  private safetyJson(snapshot:Snapshot):void{writeFileSync(join(this.safetyDirectory(),`sync-${Date.now()}.json`),JSON.stringify(snapshot),{mode:0o600});this.trimSafety();}

  async restore(id:string):Promise<void> {
    const settings=this.credentials();
    const text=await this.request(settings,`/v1/backups/${encodeURIComponent(id)}`,{method:'GET'});
    if(!settings.passphrase)throw new Error('Введите пароль этой резервной копии в настройках.');
    const content=decryptBackup(JSON.parse(text),settings.passphrase);
    await this.db.backup(join(app.getPath('userData'),`before-remote-restore-${Date.now()}.sqlite`));
    importBackupText(this.db,content);
  }
}

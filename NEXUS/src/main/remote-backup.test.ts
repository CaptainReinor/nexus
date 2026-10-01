import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { existsSync,mkdtempSync, rmSync,writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase,seedFinance, serializeBackup, type DB } from './database';
import { RemoteBackupService } from './remote-backup';
import { stampRecordChanges } from '../shared/record-clocks';
import { rowKey,type Snapshot } from '../shared/snapshot-sync';
import { encryptBackup } from './remote-crypto';

const mock=vi.hoisted(()=>({userData:''}));
vi.mock('electron',()=>({
  app:{getPath:()=>mock.userData},
  safeStorage:{getSelectedStorageBackend:()=>'gnome_libsecret',isEncryptionAvailable:()=>true,encryptString:(value:string)=>Buffer.from(value),decryptString:(value:Buffer)=>value.toString('utf8')}
}));

let db:DB;
let service:RemoteBackupService;
const testDirPrefix=join(tmpdir(),'nexus-auto-backup-');
beforeEach(()=>{
  mock.userData=mkdtempSync(testDirPrefix);
  db=openDatabase(':memory:');
  service=new RemoteBackupService(db);
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-28T08:00:00.000Z'));
});
afterEach(()=>{
  service.stopAutoUpload();
  db.close();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if(!mock.userData.startsWith(testDirPrefix))throw new Error('Неожиданный путь тестовых данных.');
  rmSync(mock.userData,{recursive:true,force:true});
});

it('allows a new guest to connect with untouched starter finances',async()=>{
  seedFinance(db);
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/v1/profile')?new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000001',name:'Friend',role:'guest',active:true})):new Response('[]')));
  await service.configure({endpoint:'https://example.com/nexus-api',token:'x'.repeat(32),passphrase:''});
  expect(service.getConfig().configured).toBe(true);
});

it('refuses attaching another user to a populated local profile without changing credentials',async()=>{
  let guest=false;
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/v1/profile')?new Response(JSON.stringify(guest?{id:'00000000-0000-4000-8000-000000000001',name:'Friend',role:'guest',active:true}:{id:'owner',name:'Owner',role:'owner',active:true})):new Response('[]')));
  const initial={endpoint:'https://example.com/nexus-api',token:'x'.repeat(32),passphrase:'test phrase with 16 chars'};
  await service.configure(initial);
  db.prepare("INSERT INTO weight_entries(day,weight_kg) VALUES ('2026-09-30',82.5)").run();
  guest=true;
  await expect(service.configure({...initial,token:'y'.repeat(32)})).rejects.toThrow('другого пользователя');
  expect(db.prepare('SELECT weight_kg FROM weight_entries').get()).toEqual({weight_kg:82.5});
  guest=false;
  await service.configure(initial);
  expect(service.getConfig().configured).toBe(true);
});

it('connects with a short code without a backup password, and enables backups separately',async()=>{
  const code='NEXUS-ABCD-EFGH-IJKL-MNOP-QRST-UVWX';
  const fetchMock=vi.fn(async(url:string,options:RequestInit)=>{
    expect((options.headers as Record<string,string>).Authorization).toBe(`Bearer ${code}`);
    if(url.endsWith('/v1/profile'))return new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000001',name:'Friend',role:'guest',active:true}));
    if(url.endsWith('/v1/users/00000000-0000-4000-8000-000000000001/invitation'))return new Response('{}',{status:403});
    return new Response('[]');
  });
  vi.stubGlobal('fetch',fetchMock);
  await service.configure({endpoint:'https://example.com/nexus-api',token:code.toLowerCase(),passphrase:''});
  expect(service.getConfig().encryptedCopiesEnabled).toBe(false);
  await expect(service.upload()).rejects.toThrow('пароль');
  await expect(service.invitation('00000000-0000-4000-8000-000000000001')).rejects.toThrow('не принял ключ');
  service.setBackupPassphrase('separate backup password');
  expect(service.getConfig().encryptedCopiesEnabled).toBe(true);
  await service.configure({endpoint:'https://example.com/nexus-api',token:code,passphrase:''});
  expect(service.getConfig().encryptedCopiesEnabled).toBe(true);
});

it('disables a provisioned OpenRouter key if the server cannot confirm the invitation',async()=>{
  let disabled=false;
  const managed='sk-or-v1-'+ 'm'.repeat(64),child='sk-or-v1-'+ 'c'.repeat(64),hash='a'.repeat(64);
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{
    if(url.endsWith('/v1/profile'))return new Response(JSON.stringify({id:'owner',name:'Owner',role:'owner',active:true}));
    if(url.endsWith('/v1/backups'))return new Response('[]');
    if(url.startsWith('https://openrouter.ai/api/v1/keys')){
      if(options.method==='GET')return new Response(JSON.stringify({data:[]}));
      if(options.method==='PATCH'){disabled=true;return new Response(JSON.stringify({data:{hash,disabled:true,limit:0.5,limit_reset:'monthly'}}));}
      expect(JSON.parse(String(options.body))).toMatchObject({limit:0.5,limit_reset:'monthly'});
      return new Response(JSON.stringify({key:child,data:{hash,disabled:false,limit:0.5,limit_reset:'monthly',include_byok_in_limit:true}}));
    }
    const body=JSON.parse(String(options.body));expect(body.aiCredentials.key).toBe(child);expect(JSON.stringify(body)).not.toContain(managed);
    return new Response('{}',{status:503});
  }));
  await service.configure({endpoint:'https://example.com/nexus-api',token:'x'.repeat(32),passphrase:'test phrase with 16 chars'});
  await service.setManagementKey(managed);
  await expect(service.createUser({name:'Friend',monthlyLimitCents:50})).rejects.toThrow('503');
  expect(disabled).toBe(true);
});

it('uploads changed data automatically and skips identical snapshots',async()=>{
  vi.spyOn(db,'backup').mockResolvedValue({totalPages:0,remainingPages:0});
  let uploads=0;
  let revision=0,snapshot:unknown=null;
  vi.stubGlobal('fetch',vi.fn(async (url:string,options:RequestInit)=>{
    if(url.endsWith('/v1/profile'))return new Response(JSON.stringify({id:'owner',name:'Owner',role:'owner',active:true}));
    if(url.endsWith('/v1/events'))return new Response('{}',{status:404});
    if(url.endsWith('/v1/state')){
      if(options.method==='PUT'){snapshot=JSON.parse(String(options.body));return new Response(JSON.stringify({revision:++revision}));}
      return new Response(JSON.stringify({revision,snapshot}));
    }
    if(options.method==='GET')return new Response('[]',{status:200});
    uploads++;
    return new Response(JSON.stringify({id:`00000000-0000-4000-8000-${String(uploads).padStart(12,'0')}`,createdAt:new Date().toISOString(),exportedAt:new Date().toISOString(),size:100,device:'Windows NEXUS'}),{status:201});
  }));
  await service.configure({endpoint:'https://example.com/nexus-api',token:'x'.repeat(32),passphrase:'test phrase with 16 chars'});
  service.startAutoUpload();
  await vi.advanceTimersByTimeAsync(10_000);
  expect(uploads).toBe(1);
  await vi.advanceTimersByTimeAsync(20_000);
  expect(uploads).toBe(1);
  db.prepare('INSERT INTO finance_accounts(name,opening_cents,active) VALUES (?,?,?)').run('Карта',10000,1);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(uploads).toBe(1);
  await vi.advanceTimersByTimeAsync(270_000);
  expect(uploads).toBe(2);
  expect(service.getConfig().lastUploadedAt).toBeTruthy();
});

it('synchronizes both directions and uses the last edit for overlapping records',async()=>{
  vi.useRealTimers();
  let revision=0;
  let snapshot:ReturnType<typeof JSON.parse>|null=null;
  const fetchMock=vi.fn(async (url:string,options:RequestInit)=>{
    if(url.endsWith('/v1/profile'))return new Response(JSON.stringify({id:'owner',name:'Owner',role:'owner',active:true}));
    if(url.endsWith('/v1/backups')&&options.method==='GET')return new Response('[]',{status:200});
    if(url.endsWith('/v1/state')&&options.method==='GET')return new Response(JSON.stringify({revision,snapshot}),{status:200});
    if(url.endsWith('/v1/state')&&options.method==='PUT'){
      const headers=options.headers as Record<string,string>;
      if(Number(headers['X-Nexus-Revision'])!==revision)return new Response('{}',{status:409});
      snapshot=JSON.parse(String(options.body));revision++;
      return new Response(JSON.stringify({revision}),{status:200});
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  vi.stubGlobal('fetch',fetchMock);
  await service.configure({endpoint:'https://example.com/nexus-api',token:'x'.repeat(32),passphrase:'test phrase with 16 chars'});
  db.prepare('INSERT INTO finance_accounts(name,opening_cents,active) VALUES (?,?,?)').run('Карта',10000,1);
  await service.syncNow();
  expect(revision).toBe(1);
  expect((snapshot as {tables:{finance_accounts:unknown[]}}).tables.finance_accounts).toHaveLength(1);
  const remote=JSON.parse(serializeBackup(db)) as {tables:{finance_accounts:{name:string}[]}};
  remote.tables.finance_accounts[0].name='Из телефона';
  snapshot=remote;revision++;
  await service.syncNow();
  expect((db.prepare('SELECT name FROM finance_accounts').get() as {name:string}).name).toBe('Из телефона');
  db.prepare('UPDATE finance_accounts SET name=? WHERE id=1').run('С компьютера');
  await service.syncNow();
  expect((snapshot as {tables:{finance_accounts:{name:string}[]}}).tables.finance_accounts[0].name).toBe('С компьютера');
  db.prepare('UPDATE finance_accounts SET name=? WHERE id=1').run('Локально');
  const previous=structuredClone(snapshot) as Snapshot;
  (snapshot as {tables:{finance_accounts:{name:string}[]}}).tables.finance_accounts[0].name='Удалённо';revision++;
  stampRecordChanges(previous,snapshot as Snapshot,rowKey);
  await service.syncNow();
  expect((db.prepare('SELECT name FROM finance_accounts').get() as {name:string}).name).toBe('Удалённо');
});

it('receives server events without periodic full-state reads and sends a local edit after the debounce',async()=>{
  vi.spyOn(db,'backup').mockResolvedValue({totalPages:0,remainingPages:0});
  let revision=0,snapshot:unknown=null,reads=0,writes=0;
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{
    if(url.endsWith('/v1/profile'))return new Response(JSON.stringify({id:'owner',name:'Owner',role:'owner',active:true}));
    if(url.endsWith('/v1/events'))return new Response(new ReadableStream({start(stream){stream.enqueue(new TextEncoder().encode('data: {"revision":0}\n\n'));options.signal?.addEventListener('abort',()=>stream.close(),{once:true});}}),{headers:{'Content-Type':'text/event-stream'}});
    if(url.endsWith('/v1/state')){
      if(options.method==='PUT'){writes++;snapshot=JSON.parse(String(options.body));return new Response(JSON.stringify({revision:++revision}));}
      reads++;return new Response(JSON.stringify({revision,snapshot}));
    }
    if(options.method==='GET')return new Response('[]');
    return new Response(JSON.stringify({id:'00000000-0000-4000-8000-000000000001',createdAt:new Date().toISOString(),exportedAt:new Date().toISOString(),size:100,device:'Windows NEXUS'}),{status:201});
  }));
  await service.configure({endpoint:'https://example.com/nexus-api',token:'x'.repeat(32),passphrase:'test phrase with 16 chars'});
  service.startAutoUpload();await vi.advanceTimersByTimeAsync(1);
  const initialReads=reads;
  await vi.advanceTimersByTimeAsync(120_000);expect(reads).toBe(initialReads);
  db.prepare('INSERT INTO finance_accounts(name,opening_cents,active) VALUES (?,?,?)').run('Карта',10000,1);
  const initialWrites=writes;service.notifyLocalChange();await vi.advanceTimersByTimeAsync(500);
  expect(writes).toBe(initialWrites+1);
  const reordered=JSON.parse(JSON.stringify(snapshot)) as {tables:Record<string,Record<string,unknown>[]>};
  for(const table of Object.keys(reordered.tables))reordered.tables[table]=reordered.tables[table].reverse().map(row=>Object.fromEntries(Object.entries(row).reverse()));
  snapshot=reordered;await service.syncNow();expect(writes).toBe(initialWrites+1);
});

it('recovers the old shared snapshot and preserves a PC habit correction together with a new phone sleep entry',async()=>{
  vi.useRealTimers();
  db.prepare("INSERT INTO habits(id,name,kind,format,target,period,active,created_at) VALUES (1,'Недельная привычка','positive','boolean',1,'weekly',1,'2026-09-01')").run();
  db.prepare("INSERT INTO habit_logs(id,habit_id,day,value,status,comment) VALUES (1,1,'2026-09-28',1,'done','')").run();
  const base=JSON.parse(serializeBackup(db)) as Snapshot;
  const legacyTables=structuredClone(base.tables);delete legacyTables.investment_accounts;delete legacyTables.investment_entries;for(const table of ['day_details','day_tasks','day_memories','assistant_reviews'])delete legacyTables[table];
  const lastSyncedHash=createHash('sha256').update(JSON.stringify(legacyTables)).digest('hex');
  const config={endpoint:'https://example.com/nexus-api',token:'x'.repeat(32),passphrase:'test phrase with 16 chars',lastSyncedRevision:45,lastSyncedHash};
  writeFileSync(join(mock.userData,'remote-backup-credentials.bin'),JSON.stringify(config));
  db.prepare("UPDATE habit_logs SET status='skipped',value=0 WHERE id=1").run();
  let snapshot=structuredClone(base),revision=50;
  snapshot.tables.health_daily_entries.push({day:'2026-09-30',sleep_start:null,sleep_end:'08:00',sleep_minutes:null,mood:null,energy:null,nutrition:null,comment:''});
  const metadata={id:'00000000-0000-4000-8000-000000000045',createdAt:'2026-09-29T21:08:24Z',exportedAt:base.exportedAt,size:100,device:'Windows NEXUS'};
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{
    if(url.endsWith('/v1/state')){
      if(options.method==='PUT'){expect((options.headers as Record<string,string>)['X-Nexus-Revision']).toBe(String(revision));snapshot=JSON.parse(String(options.body));return new Response(JSON.stringify({revision:++revision}));}
      return new Response(JSON.stringify({revision,snapshot}));
    }
    if(url.endsWith('/v1/profile'))return new Response(JSON.stringify({id:'owner',name:'Owner',role:'owner',active:true}));
    if(url.endsWith('/v1/backups'))return new Response(JSON.stringify([metadata]));
    return new Response(JSON.stringify(encryptBackup(JSON.stringify(base),config.passphrase)));
  }));
  await service.syncNow();
  expect(snapshot.tables.habit_logs[0]).toMatchObject({status:'skipped',value:0});
  expect(snapshot.tables.health_daily_entries[0].sleep_end).toBe('08:00');
  expect((db.prepare('SELECT status,value FROM habit_logs WHERE id=1').get())).toEqual({status:'skipped',value:0});
  expect((db.prepare('SELECT sleep_end FROM health_daily_entries').get())).toEqual({sleep_end:'08:00'});
  expect(service.getConfig().lastSyncedRevision).toBe(51);
  expect(existsSync(join(mock.userData,'remote-sync-base.json'))).toBe(true);
});

it('keeps local edits made during an upload and sends them in the next sync',async()=>{
  vi.useRealTimers();
  let revision=0,snapshot:Snapshot|null=null,editDuringUpload=true;
  vi.stubGlobal('fetch',vi.fn(async(url:string,options:RequestInit)=>{
    if(url.endsWith('/v1/profile'))return new Response(JSON.stringify({id:'owner',name:'Owner',role:'owner',active:true}));
    if(url.endsWith('/v1/backups'))return new Response('[]');
    if(options.method==='PUT'){
      snapshot=JSON.parse(String(options.body)) as Snapshot;
      if(editDuringUpload){
        editDuringUpload=false;
        db.prepare("INSERT INTO weight_entries(day,weight_kg) VALUES ('2026-09-30',82.5)").run();
      }
      return new Response(JSON.stringify({revision:++revision}));
    }
    return new Response(JSON.stringify({revision,snapshot}));
  }));
  await service.configure({endpoint:'https://example.com/nexus-api',token:'x'.repeat(32),passphrase:'test phrase with 16 chars'});
  db.prepare("INSERT INTO finance_accounts(name,opening_cents,active) VALUES ('Карта',10000,1)").run();
  await service.syncNow();
  expect(db.prepare('SELECT weight_kg FROM weight_entries').get()).toEqual({weight_kg:82.5});
  expect((snapshot as unknown as Snapshot).tables.weight_entries).toHaveLength(0);
  await service.syncNow();
  expect((snapshot as unknown as Snapshot).tables.weight_entries[0].weight_kg).toBe(82.5);
  expect(revision).toBe(2);
});

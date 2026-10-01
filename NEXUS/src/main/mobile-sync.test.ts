import { afterEach, expect, it, vi } from 'vitest';
import { OfflineSync, RevisionConflict, mergeSnapshots, type LocalEnvelope, type Snapshot } from '../../../NEXUS-Android/src/offline-sync';
import { watchRevisions } from '../shared/revision-events';
import { stampRecordChanges } from '../shared/record-clocks';
import { rowKey } from '../shared/snapshot-sync';
import { addTask,saveMemory,patchDay } from '../shared/life';

const sample=():Snapshot=>({format:'nexus-backup',version:5,exportedAt:'2026-09-30T00:00:00Z',tables:{weight_entries:[{id:1,day:'2026-09-30',weight_kg:90}],health_daily_entries:[{day:'2026-09-30',sleep_start:null,sleep_end:null}],settings:[],daily_journals:[]}});
const engines:OfflineSync[]=[];
it('keeps new diary facts and separate memories from two offline devices after restarting',async()=>{
  const test=setup();await test.engine.start();test.load.mockRejectedValue(new Error('offline'));
  await test.engine.change(s=>{patchDay(s,'2026-09-30',{achievement:'Finished work'});addTask(s,'Call tomorrow','2026-10-01','2026-09-30');saveMemory(s,'Met a friend','2026-09-30');});
  test.engine.stop();const restarted=test.make();await restarted.start();
  expect(restarted.state.snapshot?.tables.day_memories).toHaveLength(1);
  test.remoteChange(s=>{patchDay(s,'2026-09-30',{appetite:'low'});addTask(s,'Send CV','2026-10-01','2026-09-30');saveMemory(s,'Watched a film','2026-09-30');s.version=6;});
  test.load.mockResolvedValue(test.remote());await restarted.flush();
  expect(test.remote().snapshot.tables.day_details[0]).toMatchObject({achievement:'Finished work',appetite:'low'});
  expect(test.remote().snapshot.tables.day_tasks).toHaveLength(2);expect(test.remote().snapshot.tables.day_memories).toHaveLength(2);
  expect(restarted.pending).toBe(false);
});
afterEach(()=>{engines.forEach(engine=>engine.stop());engines.length=0;vi.useRealTimers();});
function setup(cached:LocalEnvelope|null=null){
  let disk=cached,remote={revision:1,snapshot:sample()};
  const load=vi.fn(async()=>structuredClone(remote));
  const write=vi.fn(async(value:LocalEnvelope)=>{disk=structuredClone(value);});
  const put=vi.fn(async(snapshot:Snapshot,revision:number)=>{if(revision!==remote.revision)throw new RevisionConflict();remote={revision:revision+1,snapshot:structuredClone(snapshot)};return remote.revision;});
  const make=()=>{const engine=new OfflineSync({load,put,read:async()=>disk,write});engines.push(engine);return engine;};
  return {engine:make(),make,load,put,write,disk:()=>disk,remote:()=>remote,remoteChange:(change:(snapshot:Snapshot)=>void)=>{const before=structuredClone(remote.snapshot);change(remote.snapshot);stampRecordChanges(before,remote.snapshot,rowKey,Date.now()+1);remote.revision++;}};
}

it('publishes cached data before the network answers and keeps edits after an offline restart',async()=>{
  const cached={base:{revision:1,snapshot:sample()},local:sample()};
  const test=setup(cached);test.load.mockRejectedValue(new Error('offline'));
  const startup=test.engine.start();
  await Promise.resolve();expect(test.engine.state.snapshot).toEqual(cached.local);
  await startup;
  await test.engine.change(snapshot=>{snapshot.tables.weight_entries[0].weight_kg=89;});
  expect(test.put).not.toHaveBeenCalled();expect(test.disk()?.local?.tables.weight_entries[0].weight_kg).toBe(89);
  test.engine.stop();const restarted=test.make();await restarted.start();
  expect(restarted.state.snapshot?.tables.weight_entries[0].weight_kg).toBe(89);
  expect(restarted.pending).toBe(true);
});

it('coalesces quick edits and does not fetch a complete database before each save',async()=>{
  vi.useFakeTimers();const test=setup();await test.engine.start();
  await test.engine.change(s=>{s.tables.weight_entries[0].weight_kg=89;});
  await test.engine.change(s=>{s.tables.weight_entries[0].weight_kg=88;});
  expect(test.engine.state.snapshot?.tables.weight_entries[0].weight_kg).toBe(88);
  expect(test.load).toHaveBeenCalledTimes(1);expect(test.put).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(450);
  expect(test.put).toHaveBeenCalledTimes(1);expect(test.load).toHaveBeenCalledTimes(1);
  expect(test.remote().snapshot.tables.weight_entries[0].weight_kg).toBe(88);
  expect(test.engine.status).toBe('saved');
});

it('keeps edits made while a previous upload is in flight',async()=>{
  const test=setup();await test.engine.start();
  const original=test.put.getMockImplementation()!;
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  test.put.mockImplementationOnce(async(snapshot,revision)=>{await gate;return original(snapshot,revision);});
  await test.engine.change(s=>{s.tables.weight_entries[0].weight_kg=89;});
  const pending=test.engine.flush();await Promise.resolve();
  await test.engine.change(s=>{s.tables.health_daily_entries[0].sleep_end='08:00';});
  release();await pending;
  expect(test.remote().snapshot.tables.weight_entries[0].weight_kg).toBe(89);
  expect(test.remote().snapshot.tables.health_daily_entries[0].sleep_end).toBe('08:00');
  expect(test.engine.pending).toBe(false);
});

it('merges different sleep fields edited on two devices without losing either',async()=>{
  const test=setup();await test.engine.start();
  await test.engine.change(s=>{s.tables.health_daily_entries[0].sleep_end='08:00';});
  test.remoteChange(s=>{s.tables.health_daily_entries[0].sleep_start='00:00';});
  await test.engine.flush();
  expect(test.remote().snapshot.tables.health_daily_entries[0]).toMatchObject({sleep_start:'00:00',sleep_end:'08:00'});
  expect(test.remote().snapshot.tables.health_daily_entries[0].sleep_minutes).toBe(480);
  expect(test.engine.conflicts).toHaveLength(0);
});

it('automatically keeps the newer weight when the same record is edited on two devices',async()=>{
  const test=setup();await test.engine.start();
  await test.engine.change(s=>{s.tables.weight_entries[0].weight_kg=89;});
  test.remoteChange(s=>{s.tables.weight_entries[0].weight_kg=87;});await test.engine.flush();
  expect(test.engine.status).toBe('saved');expect(test.remote().snapshot.tables.weight_entries[0].weight_kg).toBe(87);
  expect(test.engine.conflicts).toHaveLength(0);
  test.engine.stop();const restarted=test.make();await restarted.start();
  expect(restarted.state.snapshot?.tables.weight_entries[0].weight_kg).toBe(87);
});

it('does not upload when durable local storage fails',async()=>{
  const test=setup();await test.engine.start();test.write.mockRejectedValue(new Error('disk full'));
  await expect(test.engine.change(s=>{s.tables.weight_entries[0].weight_kg=89;})).rejects.toThrow();
  await test.engine.flush();expect(test.put).not.toHaveBeenCalled();expect(test.engine.status).toBe('storage-error');
});

it('retains only the three newest diary inputs',async()=>{
  const test=setup();await test.engine.start();
  await test.engine.change(s=>{s.tables.daily_journals=Array.from({length:5},(_,i)=>({id:i,created_at:`2026-09-${25+i}T00:00:00Z`}));});
  expect(test.engine.state.snapshot?.tables.daily_journals.map(row=>row.id)).toEqual([4,3,2]);
});

it('uses natural keys when both devices add the same day and preserves the remote ID',()=>{
  const base=sample(),local=sample(),remote=sample();base.tables.weight_entries=[];
  local.tables.weight_entries[0].id=555;remote.tables.weight_entries[0].id=888;
  const merged=mergeSnapshots(base,local,remote);
  expect(merged.conflicts).toHaveLength(0);expect(merged.snapshot.tables.weight_entries).toHaveLength(1);
  expect(merged.snapshot.tables.weight_entries[0].id).toBe(888);
});

it('handles split SSE records and ignores transport heartbeats',async()=>{
  const controller=new AbortController(),seen:number[]=[];
  const request=vi.fn(async()=>new Response(new ReadableStream({start(stream){const encode=new TextEncoder();for(const chunk of [': keepalive\n\n','data: {"revi','sion":3}\n\n','data: {"revision":4}\n\n'])stream.enqueue(encode.encode(chunk));stream.close();}}),{headers:{'Content-Type':'text/event-stream'}}));
  await watchRevisions({endpoint:'https://example.com',token:'secret',revision:value=>{seen.push(value);if(value===4)controller.abort();},fallback:()=>{throw new Error('unexpected fallback');}},controller.signal,request);
  expect(seen).toEqual([3,4]);expect(request).toHaveBeenCalledTimes(1);
});

it('falls back cleanly when the server has not yet been updated',async()=>{
  const controller=new AbortController(),fallback=vi.fn(()=>controller.abort());
  await watchRevisions({endpoint:'https://example.com',token:'secret',revision:()=>{},fallback},controller.signal,async()=>new Response('{}',{status:404}));
  expect(fallback).toHaveBeenCalledOnce();
});

it('uses the record edit time rather than the full backup export time to choose newer values',()=>{
  const base=sample(),local=sample(),remote=sample();
  local.tables.weight_entries[0].weight_kg=89;stampRecordChanges(base,local,rowKey,100);
  remote.tables.weight_entries[0].weight_kg=87;stampRecordChanges(base,remote,rowKey,200);
  local.exportedAt='2030-01-01T00:00:00Z';remote.exportedAt='2000-01-01T00:00:00Z';
  expect(mergeSnapshots(base,local,remote).snapshot.tables.weight_entries[0].weight_kg).toBe(87);
  stampRecordChanges(base,local,rowKey,300);
  expect(mergeSnapshots(base,local,remote).snapshot.tables.weight_entries[0].weight_kg).toBe(89);
});

it('preserves a newer deletion instead of resurrecting the old record from another device',()=>{
  const base=sample(),local=sample(),remote=sample();
  local.tables.weight_entries[0].weight_kg=89;stampRecordChanges(base,local,rowKey,100);
  remote.tables.weight_entries=[];stampRecordChanges(base,remote,rowKey,200);
  expect(mergeSnapshots(base,local,remote).snapshot.tables.weight_entries).toHaveLength(0);
  const unknown={...base,tables:Object.fromEntries(Object.keys(base.tables).map(name=>[name,[]]))};
  expect(mergeSnapshots(unknown,local,remote).snapshot.tables.weight_entries).toHaveLength(0);
  expect(mergeSnapshots(unknown,remote,local).snapshot.tables.weight_entries).toHaveLength(0);
});

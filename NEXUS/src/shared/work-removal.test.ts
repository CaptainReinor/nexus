import {expect,it} from 'vitest';
import {mergeSnapshots,rowKey,type Snapshot} from './snapshot-sync';
import {stampRecordChanges} from './record-clocks';
import {removeJob} from './work-removal';
const base=():Snapshot=>({format:'nexus-backup',version:11,exportedAt:'2026-10-12T10:00:00Z',tables:{jobs:[{id:1,title:'Дубль'},{id:2,title:'Оставить'}],job_status_history:[{id:3,job_id:1},{id:4,job_id:2}],job_experience_links:[{job_id:1,case_id:5},{job_id:2,case_id:5}],job_ai_analyses:[{id:6,job_id:1},{id:7,job_id:2}],experience_cases:[{id:5,title:'Кейс'}],ai_usage:[{id:8,cost_microusd:1}]}});
it('removes only the chosen vacancy and its dependent rows, preserving experience and usage',()=>{
 const snapshot=base();removeJob(snapshot,1);
 expect(snapshot.tables.jobs).toEqual([{id:2,title:'Оставить'}]);
 expect(snapshot.tables.job_status_history).toEqual([{id:4,job_id:2}]);
 expect(snapshot.tables.job_experience_links).toEqual([{job_id:2,case_id:5}]);
 expect(snapshot.tables.job_ai_analyses).toEqual([{id:7,job_id:2}]);
 expect(snapshot.tables.experience_cases).toEqual(base().tables.experience_cases);
 expect(snapshot.tables.ai_usage).toEqual(base().tables.ai_usage);
});
it('synchronizes a deletion in either direction and does not restore it on the next exchange',()=>{
 const original=base(),deleted=structuredClone(original);removeJob(deleted,1);stampRecordChanges(original,deleted,rowKey,1000);
 for(const [local,remote] of [[deleted,original],[original,deleted]]){
  const merged=mergeSnapshots(original,local,remote).snapshot;
  expect(merged.tables.jobs).toEqual([{id:2,title:'Оставить'}]);
  expect(mergeSnapshots(original,original,merged).snapshot.tables.jobs).toEqual(merged.tables.jobs);
 }
});
it('drops child records created on another device after their parent was deleted',()=>{
 const original=base(),deleted=structuredClone(original),remote=structuredClone(original);removeJob(deleted,1);stampRecordChanges(original,deleted,rowKey,1000);
 remote.tables.job_status_history.push({id:9,job_id:1});remote.tables.job_ai_analyses.push({id:10,job_id:1});stampRecordChanges(original,remote,rowKey,2000);
 const result=mergeSnapshots(original,deleted,remote).snapshot;
 expect(result.tables.jobs).toEqual([{id:2,title:'Оставить'}]);
 expect(result.tables.job_status_history).toEqual([{id:4,job_id:2}]);
 expect(result.tables.job_ai_analyses).toEqual([{id:7,job_id:2}]);
});

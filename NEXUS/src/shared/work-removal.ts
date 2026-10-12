import type {Snapshot} from './snapshot-sync';

const children=['job_status_history','job_experience_links','job_ai_analyses'] as const;
export function removeJob(snapshot:Snapshot,id:number):void{
  snapshot.tables.jobs=(snapshot.tables.jobs??[]).filter(row=>row.id!==id);
  for(const table of children)if(snapshot.tables[table])snapshot.tables[table]=snapshot.tables[table].filter(row=>row.job_id!==id);
}

// A second device can finish a status update or AI request after deletion.
// Such child rows must not survive without their vacancy.
export function pruneJobChildren(snapshot:Snapshot):void{
  if(!snapshot.tables.jobs)return;
  const ids=new Set(snapshot.tables.jobs.map(row=>row.id));
  for(const table of children)if(snapshot.tables[table])snapshot.tables[table]=snapshot.tables[table].filter(row=>ids.has(row.job_id));
}

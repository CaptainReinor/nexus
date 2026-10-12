import type {Job,JobStatus,JobStatusEvent} from './models';
export const workStages=['saved','applied','interview','offer','rejected'] as const;
export const workStageLabels:Record<typeof workStages[number]|'archived',string>={saved:'Не отправлен',applied:'Отклик',interview:'Собеседование',offer:'Оффер',rejected:'Отказ',archived:'Архив'};
export function workStage(status:JobStatus):typeof workStages[number]|'archived'{
 if(status==='planned')return 'saved';if(status==='viewed'||status==='invited')return 'applied';if(status==='next')return 'interview';if(status==='withdrawn')return 'archived';return status;
}
export function workStatistics(jobs:Job[],history:JobStatusEvent[]){
 const ids=new Set(jobs.map(j=>j.id)),sent=new Set<number>(),interviews=new Set<number>();
 for(const event of history.filter(e=>ids.has(e.job_id))){if(['applied','viewed','invited','interview','next','offer'].includes(event.new_status))sent.add(event.job_id);if(['interview','next'].includes(event.new_status))interviews.add(event.job_id);}
 for(const job of jobs){if(['applied','interview','offer','rejected'].includes(workStage(job.status)))sent.add(job.id);if(['interview','next'].includes(job.status))interviews.add(job.id);}
 let rejectedApplication=0,rejectedInterview=0;
 for(const job of jobs.filter(j=>j.status==='rejected')){
  const timeline=history.filter(e=>e.job_id===job.id).sort((a,b)=>a.occurred_at.localeCompare(b.occurred_at)||a.id-b.id),rejection=timeline.map(e=>e.new_status).lastIndexOf('rejected');
  const interviewed=timeline.slice(0,rejection<0?undefined:rejection+1).some(e=>['interview','next'].includes(e.new_status)||['interview','next'].includes(e.old_status??''));
  if(interviewed){rejectedInterview++;interviews.add(job.id);}else rejectedApplication++;
 }
 return {total:sent.size,rejectedApplication,interviews:interviews.size,rejectedInterview};
}

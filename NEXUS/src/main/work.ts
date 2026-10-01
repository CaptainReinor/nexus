import type { DB } from './database';
import type { ExperienceCase, ExperienceEntry, Job, JobInput, JobStatus, WorkData } from '../shared/models';
import { jobStatuses } from '../shared/models';
import { localDateTime, localDay, monthOf, weekStart } from '../shared/domain';

export class WorkRepository {
  constructor(private db: DB,private firstDay:()=>0|1=()=>1) {}
  list(): WorkData {
    const jobs=this.db.prepare('SELECT * FROM jobs ORDER BY updated_at DESC,id DESC LIMIT 1000').all() as Job[];
    const history=this.db.prepare('SELECT * FROM job_status_history ORDER BY occurred_at DESC,id DESC LIMIT 2000').all() as WorkData['history'];
    const today=localDay();
    const applications=history.filter(h=>h.new_status==='applied');
    const counts=Object.fromEntries(jobStatuses.map(status=>[status,jobs.filter(j=>j.status===status).length])) as WorkData['counts'];
    const stageTotals=Object.fromEntries(jobStatuses.map(status=>[status,history.filter(h=>h.new_status===status).length])) as WorkData['stageTotals'];
    return { jobs,history,entries:this.db.prepare('SELECT * FROM experience_entries ORDER BY start_date DESC,id DESC').all() as ExperienceEntry[],cases:this.db.prepare('SELECT * FROM experience_cases ORDER BY id DESC').all() as ExperienceCase[],links:this.db.prepare('SELECT * FROM job_experience_links').all() as WorkData['links'],aiResults:this.db.prepare('SELECT * FROM job_ai_analyses ORDER BY created_at DESC,id DESC LIMIT 100').all() as WorkData['aiResults'],weeklyApplications:applications.filter(h=>h.occurred_at.slice(0,10)>=weekStart(new Date(),this.firstDay())).length,monthlyApplications:applications.filter(h=>h.occurred_at.startsWith(monthOf(today))).length,counts,stageTotals };
  }
  saveJob(input: JobInput & {id?:number}): void {
    const now=localDateTime();
    if (input.id) this.db.prepare(`UPDATE jobs SET title=@title,company=@company,url=@url,source=@source,city=@city,work_mode=@work_mode,salary_from=@salary_from,salary_to=@salary_to,currency=@currency,original_text=@original_text,notes=@notes,updated_at=@now WHERE id=@id`).run({...input,now});
    else this.db.transaction(()=>{ const result=this.db.prepare(`INSERT INTO jobs(id,title,company,url,source,city,work_mode,salary_from,salary_to,currency,original_text,notes,status,created_at,updated_at) VALUES (nexus_id(),@title,@company,@url,@source,@city,@work_mode,@salary_from,@salary_to,@currency,@original_text,@notes,@status,@now,@now)`).run({...input,now}); this.db.prepare('INSERT INTO job_status_history(id,job_id,old_status,new_status,occurred_at,comment) VALUES (nexus_id(),?,NULL,?,?,?)').run(result.lastInsertRowid,input.status,now,'Создана вакансия'); })();
  }
  changeStatus(id:number,status:JobStatus,comment:string): void {
    this.db.transaction(()=>{ const job=this.db.prepare('SELECT status FROM jobs WHERE id=?').get(id) as {status:JobStatus}|undefined; if (!job) throw new Error('Вакансия не найдена.'); if (job.status===status) return; const now=localDateTime(); this.db.prepare('UPDATE jobs SET status=?,updated_at=? WHERE id=?').run(status,now,id); this.db.prepare('INSERT INTO job_status_history(id,job_id,old_status,new_status,occurred_at,comment) VALUES (nexus_id(),?,?,?,?,?)').run(id,job.status,status,now,comment); })();
  }
  saveEntry(input: Omit<ExperienceEntry,'id'> & {id?:number}): void {
    if (input.id) this.db.prepare('UPDATE experience_entries SET organization=@organization,position=@position,start_date=@start_date,end_date=@end_date,description=@description,skills=@skills,tools=@tools WHERE id=@id').run(input);
    else this.db.prepare('INSERT INTO experience_entries(id,organization,position,start_date,end_date,description,skills,tools) VALUES (nexus_id(),@organization,@position,@start_date,@end_date,@description,@skills,@tools)').run(input);
  }
  saveCase(input: Omit<ExperienceCase,'id'> & {id?:number}): void {
    if (input.id) this.db.prepare('UPDATE experience_cases SET entry_id=@entry_id,title=@title,situation=@situation,task=@task,actions=@actions,result=@result,skills=@skills,tools=@tools,tags=@tags WHERE id=@id').run(input);
    else this.db.prepare('INSERT INTO experience_cases(id,entry_id,title,situation,task,actions,result,skills,tools,tags) VALUES (nexus_id(),@entry_id,@title,@situation,@task,@actions,@result,@skills,@tools,@tags)').run(input);
  }
  linkCase(jobId:number,caseId:number,linked:boolean): void {
    if (linked) this.db.prepare('INSERT OR IGNORE INTO job_experience_links(job_id,case_id) VALUES (?,?)').run(jobId,caseId);
    else this.db.prepare('DELETE FROM job_experience_links WHERE job_id=? AND case_id=?').run(jobId,caseId);
  }
}

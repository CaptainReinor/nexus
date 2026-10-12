import {expect,it} from 'vitest';
import {workStatistics,workStage,workStages} from './work-stages';
import type {Job,JobStatusEvent,JobStatus} from './models';
const job=(id:number,status:JobStatus)=>({id,status}) as Job;
const event=(id:number,job_id:number,new_status:JobStatus,old_status:JobStatus|null=null):JobStatusEvent=>({id,job_id,new_status,old_status,occurred_at:`2026-10-12T12:${String(id).padStart(2,'0')}:00`,comment:''});
it('counts unique applications and separates refusal stages without drafts or deleted vacancies',()=>{
 const jobs=[job(1,'rejected'),job(2,'rejected'),job(3,'interview'),job(4,'saved'),job(5,'offer')];
 const history=[event(1,1,'applied'),event(2,1,'rejected','applied'),event(3,2,'applied'),event(4,2,'interview','applied'),event(5,2,'next','interview'),event(6,2,'rejected','next'),event(7,3,'applied'),event(8,3,'interview'),event(9,3,'applied','interview'),event(10,3,'interview'),event(11,4,'saved'),event(12,5,'applied'),event(13,5,'interview'),event(14,5,'offer'),event(15,999,'interview')];
 expect(workStatistics(jobs,history)).toEqual({total:4,rejectedApplication:1,interviews:3,rejectedInterview:1});
});
it('keeps legacy stages readable without offering them for new records',()=>{expect(workStages).toEqual(['saved','applied','interview','offer','rejected']);expect(workStage('viewed')).toBe('applied');expect(workStage('next')).toBe('interview');expect(workStage('planned')).toBe('saved');});

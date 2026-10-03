import {z} from './validation';
import {dateSchema} from './growth';
import {ensureDaily,records,put,shiftDay} from './daily-core';
import {periodStats} from './insights';
import {localDay} from './domain';
import type {Snapshot} from './snapshot-sync';
export const experimentSchema=z.object({id:z.string().uuid().optional(),title:z.string().trim().min(1).max(120),rule:z.string().trim().min(1).max(300),start_day:dateSchema,duration:z.number().int().min(3).max(90),active:z.union([z.literal(0),z.literal(1)])}).strict();
export const experimentMarkSchema=z.object({id:z.string().uuid(),day:dateSchema,done:z.boolean().nullable()}).strict();
export type ExperimentInput=z.infer<typeof experimentSchema>;
export type Experiment=Omit<ExperimentInput,'id'>&{id:string;updated_at:string};
export type ExperimentLog={id:string;experiment_id:string;day:string;done:number;updated_at:string};
export function saveExperiment(s:Snapshot,input:ExperimentInput){ensureDaily(s);const x=experimentSchema.parse(input),old=records(s,'experiments').find(r=>r.id===x.id);if(old&&records(s,'experiment_logs').some(r=>r.experiment_id===old.id)&&(old.start_day!==x.start_day||old.duration!==x.duration))throw new Error('У эксперимента с отметками нельзя менять период.');put(s,'experiments',{...x,id:x.id??crypto.randomUUID(),updated_at:new Date().toISOString()});}
export function markExperiment(s:Snapshot,input:z.infer<typeof experimentMarkSchema>){ensureDaily(s);const x=experimentMarkSchema.parse(input),exp=records(s,'experiments').find(e=>e.id===x.id);if(!exp||x.day<String(exp.start_day)||x.day>shiftDay(String(exp.start_day),Number(exp.duration)-1)||x.day>localDay())throw new Error('Этот день вне периода эксперимента.');const id=`${x.id}:${x.day}`;if(x.done===null)s.tables.experiment_logs=records(s,'experiment_logs').filter(l=>l.id!==id);else put(s,'experiment_logs',{id,experiment_id:x.id,day:x.day,done:Number(x.done),updated_at:new Date().toISOString()});}
export function experimentResult(s:Snapshot,e:Experiment,today=localDay()){const end=shiftDay(e.start_day,e.duration-1),through=end<today?end:today,count=through<e.start_day?0:Math.round((Date.parse(`${through}T12:00:00Z`)-Date.parse(`${e.start_day}T12:00:00Z`))/86400000)+1,previousStart=shiftDay(e.start_day,-e.duration),previousEnd=shiftDay(previousStart,Math.max(0,count-1)),logs=records(s,'experiment_logs').filter(l=>l.experiment_id===e.id&&String(l.day)<=through);return {id:e.id,end,elapsed:count,done:logs.filter(l=>l.done===1).length,missed:logs.filter(l=>l.done===0).length,unmarked:count-logs.length,finished:today>end,current:periodStats(s,e.start_day,through),previous:periodStats(s,previousStart,previousEnd)};}

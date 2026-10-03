import { app,Notification } from 'electron';
import { readFileSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './database';
import { serializeBackup } from './database';
import { defaultReminders,reminderSchema,reminderPlan,type ReminderSettings } from '../shared/reminders';
import type { Snapshot } from '../shared/snapshot-sync';
export class DesktopReminders{
  private settings=defaultReminders;private sent=new Set<string>();private timer:ReturnType<typeof setInterval>|null=null;private previous=Date.now();private file=join(app.getPath('userData'),'reminders.json');
  constructor(private db:DB,private open:()=>void){try{const saved=JSON.parse(readFileSync(this.file,'utf8')) as {settings:unknown;sent:string[]};this.settings=reminderSchema.parse(saved.settings);this.sent=new Set(saved.sent.filter(x=>typeof x==='string'));}catch{/* Notifications are off until chosen. */}}
  get(){return {settings:this.settings,enabled:Notification.isSupported()};}
  permission(){return {enabled:Notification.isSupported()};}
  private persist(){writeFileSync(this.file,JSON.stringify({settings:this.settings,sent:[...this.sent].slice(-200)}),'utf8');}
  save(input:ReminderSettings){this.settings=reminderSchema.parse(input);this.persist();this.previous=Date.now();}
  start(){this.timer=setInterval(()=>this.tick(),30_000);}
  private tick(){const now=Date.now(),start=Math.max(this.previous,now-120_000);this.previous=now;if(!Notification.isSupported())return;const snapshot=JSON.parse(serializeBackup(this.db)) as Snapshot;const due=reminderPlan(snapshot,this.settings,new Date(start)).filter(x=>x.at<=now&&!this.sent.has(x.id));for(const item of due){const note=new Notification({title:item.title,body:item.body});note.on('click',this.open);note.show();this.sent.add(item.id);}if(due.length)this.persist();}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
}

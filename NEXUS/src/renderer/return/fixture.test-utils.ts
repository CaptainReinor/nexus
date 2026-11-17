import {resetFocusRecords} from '../../shared/focus-reset';
import {vi} from 'vitest';
import {focusSnapshot} from '../../shared/focus-isolation';
import {saveFocusTurn,configureFocus,updateFocusConfig,removeFocusFood,type FocusAPI} from '../../shared/focus-mode';
import {saveHomePreferences} from '../../shared/home';
import {dailyData} from '../../shared/daily';
import {defaultReminders} from '../../shared/reminders';
import {localDay} from '../../shared/domain';
import {updateTask} from '../../shared/life';
import {removeTask} from '../../shared/growth';
import type {Snapshot} from '../../shared/snapshot-sync';
import type {ReturnProps} from './app';

export function returnFixture(){
 const snapshot:Snapshot={format:'nexus-backup',version:16,exportedAt:'',tables:{settings:[],mentor_turns:[],weight_entries:[],health_daily_entries:[],finance_transactions:[],food_entries:[],activity_entries:[],workouts:[],day_tasks:[],habits:[],care_slots:[],care_checks:[]}};
 const api:FocusAPI={resetRecords:async input=>resetFocusRecords(snapshot,input),snapshot:async()=>focusSnapshot(snapshot),preferences:async patch=>saveHomePreferences(snapshot,patch),configure:async config=>configureFocus(snapshot,config),updateConfig:async patch=>updateFocusConfig(snapshot,patch),removeFood:async input=>removeFocusFood(snapshot,input),publish:vi.fn(),scanLabel:vi.fn(),saveLabel:vi.fn(),send:vi.fn().mockResolvedValue({reply:'Записал.',actions:[{kind:'weight',day:localDay(),kg:82.1}]}),save:vi.fn(async input=>{saveFocusTurn(snapshot,input);}),transcribe:vi.fn().mockResolvedValue('Сегодня вес 82,1')};
 const daily:ReturnProps['daily']={list:vi.fn(async()=>dailyData(snapshot)),careMark:vi.fn(),careConfig:vi.fn(),careRole:vi.fn(),routine:vi.fn(),routineEntry:vi.fn(),payment:vi.fn(),paymentAction:vi.fn(),experiment:vi.fn(),experimentMark:vi.fn(),focus:vi.fn(),reflection:vi.fn()};
 const props:ReturnProps={api,daily,social:{state:vi.fn().mockResolvedValue({userId:'owner',revision:0,groups:[]}),change:vi.fn(),watch:()=>()=>{}},reminders:{get:vi.fn().mockResolvedValue({settings:defaultReminders,enabled:true}),save:vi.fn(),permission:vi.fn()},tasks:{save:vi.fn(async input=>updateTask(snapshot,input)),remove:vi.fn(async id=>removeTask(snapshot,id))},settings:'Доступ к данным'};
 return {snapshot,api,props};
}

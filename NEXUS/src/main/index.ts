import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z, ZodError } from 'zod';
import { openDatabase, exportBackup, importBackup } from './database';
import { HealthRepository } from './health';
import { InvestmentRepository } from './investments';
import { FinanceRepository } from './finance';
import { WorkRepository } from './work';
import { SettingsRepository } from './settings';
import { AIGateway,journalAnalysisSchema } from './ai';
import { DayLifeRepository } from './life';
import { detailPatchSchema } from '../shared/life';
import { JournalService } from './journal';
import { RemoteBackupService } from './remote-backup';
import { ProfileManager } from './profiles';
import { ProfileAIProvider } from './profile-ai';
import { habitDueToday, localDay } from '../shared/domain';
import { dailyHabitSummary } from '../shared/weekly';
import { WeeklySummaryService } from './weekly';
import { DesktopUpdates } from './updates';
import type { DashboardData } from '../shared/models';

app.commandLine.appendSwitch('lang','ru');

let window: BrowserWindow | null = null;
let notifyLocalChange=()=>{};
const changes=/^(?:life:(?:patch|markers|task|memory|remove|review)|health:(?:save|move|archive)|finance:(?:save|delete|setBudget)|investments:(?:save|delete)|work:(?:save|changeStatus|linkCase)|settings:save$|ai:|journal:(?:save|update|editAnalysis|analyze|apply|transcribe)|data:(?:import|remoteRestore)$)/;
const id=z.number().int().positive();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text=z.string().max(100000);
const nonEmpty=z.string().trim().min(1).max(500);
const optionalText=text.default('');
const boolInt=z.union([z.literal(0),z.literal(1)]);
function logError(scope:string,error:unknown):void {
  try { appendFileSync(join(app.getPath('userData'),'errors.log'),`${new Date().toISOString()} ${scope} ${error instanceof Error?error.name:'Unknown'}\n`); } catch { /* logging is best effort */ }
}
function handle<T extends z.ZodTypeAny>(channel:string,schema:T,fn:(input:z.infer<T>)=>unknown|Promise<unknown>):void {
  ipcMain.handle(channel,async(event,payload:unknown)=>{
    if (!window || event.sender!==window.webContents) throw new Error('Недопустимый источник запроса.');
    try { const result=await fn(schema.parse(payload));if(changes.test(channel))notifyLocalChange();return result; }
    catch(error) {
      logError(channel,error);
      if (error instanceof ZodError) throw new Error('Проверьте введённые данные.');
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) throw new Error('Такая запись уже существует.');
      if (error instanceof Error && /FOREIGN KEY constraint failed/.test(error.message)) throw new Error('Связанная запись не найдена.');
      throw error;
    }
  });
}
const habitSchema=z.object({id:id.optional(),name:nonEmpty,description:optionalText,kind:z.enum(['positive','avoid']),format:z.enum(['boolean','quantity','duration','avoidance']),target:z.number().nonnegative(),period:z.enum(['daily','weekly']),active:boolInt});
const dailySchema=z.object({day, sleep_start:z.string().nullable().optional(),sleep_end:z.string().nullable().optional(),sleep_minutes:z.number().int().nonnegative().nullable().optional(),mood:z.number().int().min(1).max(10).nullable().optional(),energy:z.number().int().min(1).max(10).nullable().optional(),nutrition:z.enum(['good','normal','poor']).nullable().optional(),comment:optionalText,weight:z.number().positive().max(500).nullable().optional(),workout:z.object({done:z.boolean(),type:text,minutes:z.number().int().nonnegative().nullable(),comment:text}).nullable().optional(),logs:z.array(z.object({habit_id:id,value:z.number().nonnegative(),status:z.enum(['done','missed','skipped']),comment:text}))});
const transactionSchema=z.object({occurred_at:z.string().min(10).max(30),amount_cents:z.number().int().positive().safe(),type:z.enum(['expense','income','transfer']),account_id:id,target_account_id:id.nullable(),category_id:id.nullable(),note:text});
const jobSchema=z.object({id:id.optional(),title:nonEmpty,company:nonEmpty,url:z.string().max(2000),source:text,city:text,work_mode:text,salary_from:z.number().int().nonnegative().nullable(),salary_to:z.number().int().nonnegative().nullable(),currency:z.string().min(3).max(3),original_text:text,notes:text,status:z.enum(['saved','planned','applied','viewed','invited','interview','next','offer','rejected','withdrawn','archived'])});
const entrySchema=z.object({id:id.optional(),organization:nonEmpty,position:nonEmpty,start_date:text,end_date:text,description:text,skills:text,tools:text});
const caseSchema=z.object({id:id.optional(),entry_id:id.nullable(),title:nonEmpty,situation:text,task:text,actions:text,result:text,skills:text,tools:text,tags:text});
const settingsSchema=z.object({autostart:z.boolean().optional(),currency:z.string().length(3).optional(),firstDayOfWeek:z.union([z.literal(0),z.literal(1)]).optional(),primaryAccountId:id.nullable().optional(),weeklyTarget:z.number().int().min(0).max(1000).optional(),aiEnabled:z.boolean().optional(),aiModelMode:z.enum(['preset','custom']).optional(),cheapModel:text.optional(),standardModel:text.optional(),advancedModel:text.optional(),transcriptionModel:text.optional(),aiBudgetCents:z.number().int().min(0).max(10_000_000).optional()});

function createWindow():void {
  window=new BrowserWindow({width:1480,height:920,minWidth:980,minHeight:660,backgroundColor:'#14191e',title:'NEXUS',icon:join(app.getAppPath(),'assets/nexus-icon.png'),show:false,webPreferences:{preload:join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  window.webContents.session.setPermissionRequestHandler((contents,permission,callback,details)=>{const mediaTypes=(details as {mediaTypes?:string[]}).mediaTypes??[];callback(contents===window?.webContents&&permission==='media'&&!mediaTypes.includes('video'));});
  window.webContents.session.setPermissionCheckHandler((contents,permission)=>contents===window?.webContents&&permission==='media');
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  window.once('ready-to-show',()=>window?.show());
  if (process.env.NEXUS_DEV_URL) void window.loadURL(process.env.NEXUS_DEV_URL);
  else void window.loadFile(join(__dirname,'../dist/index.html'));
  window.on('closed',()=>{window=null;});
}

if(process.env.NEXUS_TEST_USER_DATA){mkdirSync(process.env.NEXUS_TEST_USER_DATA,{recursive:true});app.setPath('userData',process.env.NEXUS_TEST_USER_DATA);}
const profiles=new ProfileManager(app.getPath('userData'));
mkdirSync(profiles.directory(),{recursive:true});app.setPath('userData',profiles.directory());
app.setPath('sessionData',profiles.directory());
void app.whenReady().then(()=>{
  if(process.platform==='win32')app.setAppUserModelId('ru.nexus.desktop');
  Menu.setApplicationMenu(null);
  const dbPath=join(app.getPath('userData'),'nexus.sqlite');
  const db=openDatabase(dbPath,{seedFinance:true});
  const updates=new DesktopUpdates(async()=>{await db.backup(join(app.getPath('userData'),'before-update.sqlite'));});
  handle('updates:status',z.undefined(),()=>updates.status());
  handle('updates:check',z.undefined(),()=>updates.check());
  handle('updates:download',z.undefined(),()=>updates.download());
  handle('updates:install',z.undefined(),()=>updates.install());
  const remoteBackup=new RemoteBackupService(db,()=>window?.webContents.reload());
  const settings=new SettingsRepository(db,dbPath,()=>remoteBackup.isGuest()),health=new HealthRepository(db),finance=new FinanceRepository(db,()=>settings.get().firstDayOfWeek),work=new WorkRepository(db,()=>settings.get().firstDayOfWeek),ai=new AIGateway(db,settings,work,new ProfileAIProvider(remoteBackup),()=>!remoteBackup.isGuest()&&settings.get().hasApiKey?settings.getApiKey():''),journal=new JournalService(db,ai,health,finance,work,settings);
  handle('profiles:list',z.undefined(),()=>profiles.list());
  handle('profiles:create',z.string().trim().min(1).max(80),name=>{profiles.create(name);return profiles.list();});
  handle('profiles:select',z.union([z.literal('local'),z.string().uuid()]),identity=>{remoteBackup.stopAutoUpload();profiles.select(identity);setTimeout(()=>{app.relaunch();app.quit();},300);});
  handle('accounts:profile',z.undefined(),()=>remoteBackup.profile());
  handle('accounts:managementStatus',z.undefined(),()=>remoteBackup.managementStatus());
  handle('accounts:setManagementKey',z.string().max(512),key=>remoteBackup.setManagementKey(key));
  handle('accounts:list',z.undefined(),()=>remoteBackup.users());
  handle('accounts:invitation',z.string().uuid(),identity=>remoteBackup.invitation(identity));
  handle('data:setBackupPassphrase',z.string().min(16).max(256),passphrase=>remoteBackup.setBackupPassphrase(passphrase));
  handle('accounts:create',z.object({name:z.string().trim().min(1).max(80),monthlyLimitCents:z.number().int().min(0).max(10000)}).strict(),input=>remoteBackup.createUser(input));
  handle('accounts:update',z.object({id:z.string().uuid(),active:z.boolean().optional(),monthlyLimitCents:z.number().int().min(0).max(10000).optional()}).strict(),input=>remoteBackup.updateUser(input));
  const life=new DayLifeRepository(db);
  handle('life:list',z.undefined(),()=>life.list());
  handle('life:patch',z.object({day,patch:detailPatchSchema}),input=>life.patch(input.day,input.patch));
  handle('life:markers',z.array(z.enum(['appetite','sleep_quality','tension'])).max(3),input=>life.markers(input));
  handle('life:task',z.object({id:z.string().uuid().optional(),title:z.string().trim().min(1).max(300).optional(),day,due_day:day,status:z.enum(['open','done']).optional()}).strict(),input=>life.task(input));
  handle('life:memory',z.object({id:z.string().uuid().optional(),day,text:z.string().trim().min(1).max(2000)}).strict(),input=>life.memory(input));
  handle('life:remove',z.object({table:z.enum(['day_tasks','day_memories']),id:z.string().uuid()}),input=>life.remove(input.table,input.id));
  handle('life:review',z.object({kind:z.enum(['day','week']),start:day,end:day,overrideBudget:z.boolean().optional()}).refine(x=>x.start<=x.end&&(x.kind!=='day'||x.start===x.end)),async input=>{const review=await ai.reviewLife(life.facts(input.start,input.end),input.overrideBudget);life.saveReview(input.kind,input.start,input.end,review);return review;});
  handle('journal:editAnalysis',z.object({id,analysis:journalAnalysisSchema}),input=>journal.editAnalysis(input.id,input.analysis));
  remoteBackup.startAutoUpload();
  notifyLocalChange=()=>remoteBackup.notifyLocalChange();
  const investments=new InvestmentRepository(db);
  handle('investments:list',z.undefined(),()=>investments.list());
  handle('investments:saveAccount',z.object({id:id.optional(),name:nonEmpty,active:boolInt}),input=>investments.saveAccount(input));
  handle('investments:saveEntry',z.object({account_id:id,day,value_cents:z.number().int().nonnegative().safe(),flow_cents:z.number().int().safe(),note:text}),input=>investments.saveEntry(input));
  handle('investments:deleteEntry',id,input=>investments.deleteEntry(input));
  handle('health:list',z.undefined(),()=>health.list());
  handle('health:saveHabit',habitSchema,input=>health.saveHabit(input));
  handle('health:moveHabit',z.object({id,direction:z.enum(['up','down'])}),input=>health.moveHabit(input.id,input.direction));
  handle('health:saveDay',dailySchema,input=>health.saveDay(input));
  handle('health:saveDayField',z.discriminatedUnion('field',[
    z.object({day,field:z.literal('weight'),value:z.number().positive().max(500).nullable()}),
    z.object({day,field:z.literal('sleep_start'),value:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()}),
    z.object({day,field:z.literal('sleep_end'),value:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable()}),
    z.object({day,field:z.literal('mood'),value:z.number().int().min(1).max(10).nullable()}),
    z.object({day,field:z.literal('energy'),value:z.number().int().min(1).max(10).nullable()}),
    z.object({day,field:z.literal('nutrition'),value:z.enum(['good','normal','poor']).nullable()}),
    z.object({day,field:z.literal('comment'),value:text})
  ]),input=>health.saveDayField(input));
  handle('health:saveHabitLog',z.object({day,habit_id:id,value:z.number().nonnegative(),status:z.enum(['done','missed','skipped']),comment:text}),input=>health.saveHabitLog(input));
  handle('health:archiveHabit',id,input=>health.archiveHabit(input));
  handle('finance:list',z.undefined(),()=>finance.list());
  handle('finance:saveAccount',z.object({id:id.optional(),name:nonEmpty,opening_cents:z.number().int().safe(),active:boolInt}),input=>finance.saveAccount(input));
  handle('finance:saveCategory',z.object({id:id.optional(),name:nonEmpty,kind:z.enum(['expense','income']),active:boolInt}),input=>finance.saveCategory(input));
  handle('finance:saveTransaction',transactionSchema,input=>finance.saveTransaction(input));
  handle('finance:deleteTransaction',id,input=>finance.deleteTransaction(input));
  handle('finance:deleteCategory',id,input=>finance.deleteCategory(input));
  handle('finance:setBudget',z.object({month:z.string().regex(/^\d{4}-\d{2}$/),amount_cents:z.number().int().nonnegative().safe()}),input=>finance.setBudget(input));
  handle('work:list',z.undefined(),()=>work.list());
  handle('work:saveJob',jobSchema,input=>work.saveJob(input));
  handle('work:changeStatus',z.object({id,status:jobSchema.shape.status,comment:text}),input=>work.changeStatus(input.id,input.status,input.comment));
  handle('work:saveEntry',entrySchema,input=>work.saveEntry(input));
  handle('work:saveCase',caseSchema,input=>work.saveCase(input));
  handle('work:linkCase',z.object({jobId:id,caseId:id,linked:z.boolean()}),input=>work.linkCase(input.jobId,input.caseId,input.linked));
  handle('settings:get',z.undefined(),()=>settings.get());
  handle('settings:save',settingsSchema,input=>settings.save(input));
  handle('settings:setApiKey',z.string().max(1000),input=>settings.setApiKey(input));
  handle('settings:testConnection',z.undefined(),()=>ai.testConnection());
  handle('settings:usage',z.undefined(),()=>settings.usage());
  handle('ai:run',z.object({jobId:id,kind:z.enum(['analysis','cover','interview']),overrideBudget:z.boolean().optional()}),input=>ai.run(input.jobId,input.kind,input.overrideBudget));
  handle('ai:parseVacancy',z.object({text:z.string().trim().min(20).max(20000),overrideBudget:z.boolean().optional()}),input=>ai.parseVacancy(input.text,input.overrideBudget));
  handle('dashboard:weekly',z.enum(['current','previous']),period=>new WeeklySummaryService(health,finance,investments).get(period));
  handle('dashboard:get',z.undefined(),():DashboardData=>{
    const h=health.list(),f=finance.list(),w=work.list(),day=localDay();
    const {completed,total}=dailyHabitSummary(h,day);
    const habits=h.habits.filter(habit=>habitDueToday(habit,h.logs,day)).map(habit=>{const log=h.logs.find(log=>log.habit_id===habit.id&&log.day===day);return {id:habit.id,name:habit.name,kind:habit.kind,format:habit.format,target:habit.target,period:habit.period,value:log?.value??null,status:log?.status??null};});
    const weight=h.weights[0]?.weight_kg??null;
    return {health:{completed,total,habits,weight,sleepMinutes:h.daily?.sleep_minutes??h.history.find(x=>x.sleep_minutes!=null)?.sleep_minutes??null},finance:{today:f.today_expense,month:f.month_expense,budget:f.budget?.amount_cents??null,remaining:f.budget?f.budget.amount_cents-f.month_expense:null},work:{weekly:w.weeklyApplications,target:settings.get().weeklyTarget,active:w.jobs.filter(j=>!['archived','rejected','withdrawn'].includes(j.status)).length,interviews:w.counts.interview}};
  });
  handle('data:export',z.undefined(),async()=>{const r=await dialog.showSaveDialog(window!,{title:'Экспорт NEXUS',defaultPath:`NEXUS-${localDay()}.json`,filters:[{name:'Резервная копия NEXUS',extensions:['json']}]});if(r.canceled||!r.filePath)return null;exportBackup(db,r.filePath);return r.filePath;});
  handle('data:import',z.undefined(),async()=>{const r=await dialog.showOpenDialog(window!,{title:'Импорт NEXUS',properties:['openFile'],filters:[{name:'Резервная копия NEXUS',extensions:['json']}]});if(r.canceled||!r.filePaths[0])return false;await db.backup(join(app.getPath('userData'),`before-import-${Date.now()}.sqlite`));importBackup(db,r.filePaths[0]);return true;});
  handle('data:remoteConfig',z.undefined(),()=>remoteBackup.getConfig());
  handle('data:copyRemoteToken',z.undefined(),()=>remoteBackup.copyPairingToken());
  handle('data:enableAndroidAI',z.undefined(),()=>remoteBackup.enableAndroidAI(settings.getApiKey()));
  handle('data:configureRemote',z.object({endpoint:z.string().url().max(500),token:z.string().min(32).max(512),passphrase:z.union([z.literal(''),z.string().min(16).max(256)])}),input=>remoteBackup.configure(input));
  handle('data:remoteList',z.undefined(),()=>remoteBackup.list());
  handle('data:remoteUpload',z.undefined(),()=>remoteBackup.upload());
  handle('data:remoteRestore',z.string().uuid(),input=>remoteBackup.restore(input));
  handle('external:open',z.string().url(),async url=>{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))throw new Error('Ссылка недоступна.');await shell.openExternal(url);});
  handle('journal:list',z.undefined(),()=>journal.list());
  handle('journal:save',z.object({day,text:z.string().trim().min(1).max(20000),source:z.enum(['text','voice'])}),input=>journal.save(input.day,input.text,input.source));
  handle('journal:update',z.object({id,day,text:z.string().max(20000),source:z.enum(['text','voice'])}),input=>journal.update(input.id,input.day,input.text,input.source));
  handle('journal:analyze',z.object({id,overrideBudget:z.boolean().optional()}),input=>journal.analyze(input.id,input.overrideBudget));
  handle('journal:apply',z.object({id,keys:z.array(z.string().max(100)).max(100)}),input=>journal.apply(input.id,input.keys));
  handle('journal:transcribe',z.object({base64:z.string().min(1).max(32_000_000),format:z.enum(['webm','wav','mp3']),overrideBudget:z.boolean().optional()}),input=>ai.transcribe(input.base64,input.format,input.overrideBudget));
  createWindow();
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});
  app.on('before-quit',()=>{remoteBackup.stopAutoUpload();db.close();});
}).catch(error=>{ logError('startup',error); dialog.showErrorBox('NEXUS не запустился',error instanceof Error?error.message:'Неизвестная ошибка'); app.quit(); });

app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});

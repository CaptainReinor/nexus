import type { LifeSuggestions,DayLifeData,DetailPatch,Marker,CoachReview } from './life';
export type HabitKind = 'positive' | 'avoid';
export type HabitFormat = 'boolean' | 'quantity' | 'duration' | 'avoidance';
export type Habit = { id: number; name: string; description: string; kind: HabitKind; format: HabitFormat; target: number; period: 'daily' | 'weekly'; active: number; sort_order: number; created_at: string };
export type HabitLog = { id: number; habit_id: number; day: string; value: number; status: 'done' | 'missed' | 'skipped'; comment: string };
export type DailyEntry = { day: string; sleep_start: string | null; sleep_end: string | null; sleep_minutes: number | null; mood: number | null; energy: number | null; nutrition: 'good' | 'normal' | 'poor' | null; comment: string };
export type WeightEntry = { id: number; day: string; weight_kg: number };
export type Workout = { id: number; day: string; done: number; type: string; minutes: number | null; comment: string };
export type HealthData = { habits: Habit[]; logs: HabitLog[]; daily: DailyEntry | null; weights: WeightEntry[]; workouts: Workout[]; history: DailyEntry[] };
export type Account = { id: number; name: string; opening_cents: number; active: number; balance_cents: number };
export type Category = { id: number; name: string; kind: 'expense' | 'income'; active: number };
export type Transaction = { id: number; occurred_at: string; amount_cents: number; type: 'expense' | 'income' | 'transfer'; account_id: number; target_account_id: number | null; category_id: number | null; note: string; account_name?: string; category_name?: string; target_name?: string };
export type InvestmentAccount={id:number;name:string;active:number};
export type InvestmentEntry={id:number;account_id:number;day:string;value_cents:number;flow_cents:number;note:string};
export type InvestmentData={accounts:InvestmentAccount[];entries:InvestmentEntry[]};
export type Budget = { month: string; amount_cents: number };
export type FinanceData = { accounts: Account[]; categories: Category[]; transactions: Transaction[]; budget: Budget | null; today_expense: number; week_expense: number; month_expense: number; month_income: number; category_totals: { name: string; amount_cents: number }[]; expense_history:{day:string;amount_cents:number}[]; balance_history: { day: string; balance_cents: number }[] };
export const jobStatuses = ['saved','planned','applied','viewed','invited','interview','next','offer','rejected','withdrawn','archived'] as const;
export type JobStatus = typeof jobStatuses[number];
export const jobStatusLabels: Record<JobStatus,string> = { saved:'Сохранена', planned:'Планирую отклик', applied:'Отклик отправлен', viewed:'Просмотрена', invited:'Приглашение', interview:'Собеседование', next:'Следующий этап', offer:'Оффер', rejected:'Отказ', withdrawn:'Сам отказался', archived:'Архив' };
export type Job = { id: number; title: string; company: string; url: string; source: string; city: string; work_mode: string; salary_from: number | null; salary_to: number | null; currency: string; original_text: string; notes: string; status: JobStatus; created_at: string; updated_at: string };
export type JobStatusEvent = { id: number; job_id: number; old_status: JobStatus | null; new_status: JobStatus; occurred_at: string; comment: string };
export type ExperienceEntry = { id: number; organization: string; position: string; start_date: string; end_date: string; description: string; skills: string; tools: string };
export type ExperienceCase = { id: number; entry_id: number; title: string; situation: string; task: string; actions: string; result: string; skills: string; tools: string; tags: string };
export type JobAnalysis = { requirements: string[]; matches: { fact: string; source: string }[]; relevantCaseIds: number[]; gaps: string[]; emphasize: string[]; interviewQuestions: string[]; preparation: string[] };
export type JobAIResult = { id: number; job_id: number; kind: 'analysis' | 'cover' | 'interview'; content: string; created_at: string };
export type WorkData = { jobs: Job[]; history: JobStatusEvent[]; entries: ExperienceEntry[]; cases: ExperienceCase[]; links: { job_id: number; case_id: number }[]; aiResults: JobAIResult[]; weeklyApplications: number; monthlyApplications: number; counts: Record<JobStatus,number>; stageTotals:Record<JobStatus,number> };
export type Settings = { autostart: boolean; currency: string; firstDayOfWeek: 0 | 1; primaryAccountId:number|null; weeklyTarget: number; aiEnabled: boolean; aiModelMode:'preset'|'custom'; cheapModel: string; standardModel: string; advancedModel: string; transcriptionModel: string; aiBudgetCents: number; hasApiKey: boolean; dbPath: string };
export type AIUsage = { id: number; timestamp: string; provider: string; model: string; feature: string; input_tokens: number | null; output_tokens: number | null; cost_microusd: number | null; request_id: string; status: string };
export type RemoteBackupInfo={id:string;createdAt:string;exportedAt:string;size:number;device:string};
export type RemoteBackupConfig={endpoint:string;configured:boolean;lastUploadedAt:string|null;lastSyncedRevision:number|null;autoError:string|null;encryptedCopiesEnabled:boolean};
export type WeeklySummary={start:string;end:string;health:{habits:{id:number;name:string;period:'daily'|'weekly';completed:number;observed:number;expected:number}[];weightStart:number|null;weightEnd:number|null;weightMeasurements:number;sleepDays:number;sleepAverage:number|null};finance:{expense:number;income:number;categories:{name:string;amount_cents:number}[]};investments:{name:string;value:number|null;profit:number|null;measurements:number}[]};
export type DashboardData = { health: { completed: number; total: number; habits: (Pick<Habit,'id'|'name'|'kind'|'format'|'target'|'period'>&{value:number|null;status:HabitLog['status']|null})[]; weight: number | null; sleepMinutes: number | null }; finance: { today: number; month: number; budget: number | null; remaining: number | null }; work: { weekly: number; target: number; active: number; interviews: number } };
export type DailyInput = { day: string; sleep_start?: string | null; sleep_end?: string | null; sleep_minutes?: number | null; mood?: number | null; energy?: number | null; nutrition?: 'good'|'normal'|'poor'|null; comment?: string; weight?: number | null; workout?: { done: boolean; type: string; minutes: number | null; comment: string } | null; logs: { habit_id: number; value: number; status: 'done'|'missed'|'skipped'; comment: string }[] };
export type DayFieldInput =
  | { day:string; field:'weight'; value:number|null }
  | { day:string; field:'sleep_start'|'sleep_end'; value:string|null }
  | { day:string; field:'mood'|'energy'; value:number|null }
  | { day:string; field:'nutrition'; value:'good'|'normal'|'poor'|null }
  | { day:string; field:'comment'; value:string };
export type HabitLogInput = {day:string;habit_id:number;value:number;status:'done'|'missed'|'skipped';comment:string};
export type JournalAnalysis = { life?:LifeSuggestions; summary:string; health:{weightKg:number|null;sleepStart:string|null;sleepEnd:string|null;mood:number|null;energy:number|null;nutrition:'good'|'normal'|'poor'|null;workout:{type:string;minutes:number|null}|null;habits:{habitId:number;value:number;status:'done'|'missed';reason:string}[]}; finance:{type:'expense'|'income';amountCents:number;categoryId:number|null;accountId:number|null;note:string}[]; work:{jobId:number;status:JobStatus;reason:string}[]; uncertain:string[] };
export type JournalEntry = {id:number;day:string;raw_text:string;source:'text'|'voice';analysis_json:string|null;applied_json:string;created_at:string};
export type JobInput = Omit<Job,'id'|'created_at'|'updated_at'>;
export type VacancyDraft = { title:string|null;company:string|null;url:string|null;source:string|null;city:string|null;work_mode:string|null;salary_from:number|null;salary_to:number|null;currency:string|null };
export interface NexusAPI {
  profiles:{list():Promise<import('./accounts').LocalProfiles>;create(name:string):Promise<import('./accounts').LocalProfiles>;select(id:string):Promise<void>};
  accounts:{invitation(id:string):Promise<import('./accounts').UserInvitation>;profile():Promise<import('./accounts').RemoteProfile|null>;managementStatus():Promise<{configured:boolean}>;setManagementKey(key:string):Promise<void>;list():Promise<import('./accounts').RemoteProfile[]>;create(input:{name:string;monthlyLimitCents:number}):Promise<import('./accounts').UserInvitation>;update(input:{id:string;active?:boolean;monthlyLimitCents?:number}):Promise<import('./accounts').RemoteProfile>};
  life:{list():Promise<DayLifeData>;patch(input:{day:string;patch:DetailPatch}):Promise<void>;markers(fields:Marker[]):Promise<void>;task(input:{id?:string;title?:string;day:string;due_day:string;status?:'open'|'done'}):Promise<void>;memory(input:{id?:string;day:string;text:string}):Promise<void>;remove(input:{table:'day_tasks'|'day_memories';id:string}):Promise<void>;review(input:{kind:'day'|'week';start:string;end:string;overrideBudget?:boolean}):Promise<CoachReview>};
  investments:{list():Promise<InvestmentData>;saveAccount(input:{id?:number;name:string;active:number}):Promise<void>;saveEntry(input:Omit<InvestmentEntry,'id'>):Promise<void>;deleteEntry(id:number):Promise<void>};
  health: {
    list(): Promise<HealthData>;
    saveHabit(input: Omit<Habit,'id'|'created_at'|'sort_order'> & { id?: number }): Promise<void>;
    moveHabit(input: { id: number; direction: 'up' | 'down' }): Promise<void>;
    saveDay(input: DailyInput): Promise<void>;
    saveDayField(input: DayFieldInput): Promise<void>;
    saveHabitLog(input: HabitLogInput): Promise<void>;
    archiveHabit(id: number): Promise<void>;
  };
  finance: {
    list(): Promise<FinanceData>;
    saveAccount(input: { id?: number; name: string; opening_cents: number; active: number }): Promise<void>;
    saveCategory(input: { id?: number; name: string; kind: 'expense'|'income'; active: number }): Promise<void>;
    saveTransaction(input: Omit<Transaction,'id'|'account_name'|'category_name'|'target_name'>): Promise<void>;
    deleteTransaction(id:number): Promise<void>;
    setBudget(input: Budget): Promise<void>;
  };
  work: {
    list(): Promise<WorkData>;
    saveJob(input: JobInput & { id?: number }): Promise<void>;
    changeStatus(input: { id: number; status: JobStatus; comment: string }): Promise<void>;
    saveEntry(input: Omit<ExperienceEntry,'id'> & { id?: number }): Promise<void>;
    saveCase(input: Omit<ExperienceCase,'id'> & { id?: number }): Promise<void>;
    linkCase(input: { jobId: number; caseId: number; linked: boolean }): Promise<void>;
  };
  settings: {
    get(): Promise<Settings>;
    save(input: Partial<Omit<Settings,'hasApiKey'|'dbPath'>>): Promise<void>;
    setApiKey(key: string): Promise<void>;
    testConnection(): Promise<boolean>;
    usage(): Promise<AIUsage[]>;
  };
  ai: {
    run(input: { jobId: number; kind: 'analysis'|'cover'|'interview'; overrideBudget?: boolean }): Promise<JobAIResult>;
    parseVacancy(input:{text:string;overrideBudget?:boolean}):Promise<VacancyDraft>;
  };
  data: {
    export(): Promise<string | null>;
    import(): Promise<boolean>;
    remoteConfig():Promise<RemoteBackupConfig>;
    setBackupPassphrase(passphrase:string):Promise<RemoteBackupConfig>;
    copyRemoteToken():Promise<void>;
    enableAndroidAI():Promise<void>;
    configureRemote(input:{endpoint:string;token:string;passphrase:string}):Promise<RemoteBackupConfig>;
    remoteList():Promise<RemoteBackupInfo[]>;
    remoteUpload():Promise<RemoteBackupInfo>;
    remoteRestore(id:string):Promise<void>;
  };
  dashboard: { get(): Promise<DashboardData>; weekly(period:'current'|'previous'):Promise<WeeklySummary> };
  external: { open(url: string): Promise<void> };
  journal: {
    list(): Promise<JournalEntry[]>;
    save(input:{day:string;text:string;source:'text'|'voice'}):Promise<JournalEntry>;
    update(input:{id:number;day:string;text:string;source:'text'|'voice'}):Promise<JournalEntry>;
    editAnalysis(input:{id:number;analysis:JournalAnalysis}):Promise<JournalEntry>;
    analyze(id:number,overrideBudget?:boolean):Promise<JournalEntry>;
    apply(input:{id:number;keys:string[]}):Promise<void>;
    transcribe(input:{base64:string;format:'webm'|'wav'|'mp3';overrideBudget?:boolean}):Promise<string>;
  };
}

import Database from 'better-sqlite3';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { randomInt } from 'node:crypto';
import { defaultDebit, defaultCategories } from '../shared/finance-defaults';

export type DB = Database.Database;
export const schemaVersion = 8;
export const backupTables = [
  'settings','habits','habit_logs','health_daily_entries','weight_entries','workouts',
  'finance_accounts','finance_categories','finance_transactions','finance_budgets',
  'jobs','job_status_history','experience_entries','experience_cases','job_experience_links','job_ai_analyses','ai_usage','daily_journals','investment_accounts','investment_entries','day_details','day_tasks','day_memories','assistant_reviews',
  'financial_goals','weekly_plans','recurring_tasks','recurring_skips','custom_metrics','metric_entries'
] as const;

const migrations: string[] = [
  `
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE habits (id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL CHECK(kind IN ('positive','avoid')), format TEXT NOT NULL CHECK(format IN ('boolean','quantity','duration','avoidance')), target REAL NOT NULL DEFAULT 1, period TEXT NOT NULL CHECK(period IN ('daily','weekly')), active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
  CREATE TABLE habit_logs (id INTEGER PRIMARY KEY, habit_id INTEGER NOT NULL REFERENCES habits(id), day TEXT NOT NULL, value REAL NOT NULL, status TEXT NOT NULL CHECK(status IN ('done','missed','skipped')), comment TEXT NOT NULL DEFAULT '', UNIQUE(habit_id,day));
  CREATE TABLE health_daily_entries (day TEXT PRIMARY KEY, sleep_start TEXT, sleep_end TEXT, sleep_minutes INTEGER, mood INTEGER CHECK(mood BETWEEN 1 AND 10), energy INTEGER CHECK(energy BETWEEN 1 AND 10), nutrition TEXT CHECK(nutrition IN ('good','normal','poor')), comment TEXT NOT NULL DEFAULT '');
  CREATE TABLE weight_entries (id INTEGER PRIMARY KEY, day TEXT NOT NULL UNIQUE, weight_kg REAL NOT NULL CHECK(weight_kg > 0));
  CREATE TABLE workouts (id INTEGER PRIMARY KEY, day TEXT NOT NULL UNIQUE, done INTEGER NOT NULL, type TEXT NOT NULL DEFAULT '', minutes INTEGER, comment TEXT NOT NULL DEFAULT '');
  CREATE TABLE finance_accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, opening_cents INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE finance_categories (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('expense','income')), active INTEGER NOT NULL DEFAULT 1, UNIQUE(name,kind));
  CREATE TABLE finance_transactions (id INTEGER PRIMARY KEY, occurred_at TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), type TEXT NOT NULL CHECK(type IN ('expense','income','transfer')), account_id INTEGER NOT NULL REFERENCES finance_accounts(id), target_account_id INTEGER REFERENCES finance_accounts(id), category_id INTEGER REFERENCES finance_categories(id), note TEXT NOT NULL DEFAULT '', CHECK(type != 'transfer' OR (target_account_id IS NOT NULL AND target_account_id != account_id)));
  CREATE TABLE finance_budgets (month TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL CHECK(amount_cents >= 0));
  CREATE TABLE jobs (id INTEGER PRIMARY KEY, title TEXT NOT NULL, company TEXT NOT NULL, url TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '', work_mode TEXT NOT NULL DEFAULT '', salary_from INTEGER, salary_to INTEGER, currency TEXT NOT NULL DEFAULT 'RUB', original_text TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE job_status_history (id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id), old_status TEXT, new_status TEXT NOT NULL, occurred_at TEXT NOT NULL, comment TEXT NOT NULL DEFAULT '');
  CREATE TABLE experience_entries (id INTEGER PRIMARY KEY, organization TEXT NOT NULL, position TEXT NOT NULL, start_date TEXT NOT NULL DEFAULT '', end_date TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', skills TEXT NOT NULL DEFAULT '', tools TEXT NOT NULL DEFAULT '');
  CREATE TABLE experience_cases (id INTEGER PRIMARY KEY, entry_id INTEGER NOT NULL REFERENCES experience_entries(id), title TEXT NOT NULL, situation TEXT NOT NULL DEFAULT '', task TEXT NOT NULL DEFAULT '', actions TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT '', skills TEXT NOT NULL DEFAULT '', tools TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '');
  CREATE TABLE job_experience_links (job_id INTEGER NOT NULL REFERENCES jobs(id), case_id INTEGER NOT NULL REFERENCES experience_cases(id), PRIMARY KEY(job_id,case_id));
  CREATE TABLE job_ai_analyses (id INTEGER PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id), kind TEXT NOT NULL CHECK(kind IN ('analysis','cover','interview')), content TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE TABLE ai_usage (id INTEGER PRIMARY KEY, timestamp TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, feature TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER, cost_microusd INTEGER, request_id TEXT NOT NULL DEFAULT '', status TEXT NOT NULL);
  `,
  `
  CREATE INDEX idx_habit_logs_day ON habit_logs(day);
  CREATE INDEX idx_weights_day ON weight_entries(day);
  CREATE INDEX idx_transactions_date ON finance_transactions(occurred_at);
  CREATE INDEX idx_jobs_status ON jobs(status);
  CREATE INDEX idx_job_history_date ON job_status_history(occurred_at);
  CREATE INDEX idx_usage_date ON ai_usage(timestamp);
  `,
  `
  CREATE TABLE daily_journals (id INTEGER PRIMARY KEY, day TEXT NOT NULL, raw_text TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('text','voice')), analysis_json TEXT, applied_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL);
  CREATE INDEX idx_journals_day ON daily_journals(day,created_at);
  `,
  `
  ALTER TABLE habits ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
  UPDATE habits SET sort_order=-id;
  `,
  `
  CREATE TABLE investment_accounts (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE investment_entries (id INTEGER PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES investment_accounts(id), day TEXT NOT NULL, value_cents INTEGER NOT NULL CHECK(value_cents >= 0), flow_cents INTEGER NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', UNIQUE(account_id,day));
  CREATE INDEX idx_investment_entries_day ON investment_entries(account_id,day);
  `,
  `
  CREATE TABLE day_details (day TEXT PRIMARY KEY, contexts_json TEXT NOT NULL DEFAULT '[]', achievement TEXT NOT NULL DEFAULT '', appetite TEXT CHECK(appetite IN ('low','normal','high')), sleep_quality TEXT CHECK(sleep_quality IN ('rested','interrupted','unrested')), tension TEXT CHECK(tension IN ('calm','tense','overloaded')));
  CREATE TABLE day_tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, day TEXT NOT NULL, due_day TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('open','done')), created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX idx_day_tasks_due ON day_tasks(due_day,status);
  CREATE TABLE day_memories (id TEXT PRIMARY KEY, day TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
  CREATE INDEX idx_day_memories_day ON day_memories(day);
  CREATE TABLE assistant_reviews (id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('day','week')), start TEXT NOT NULL, end TEXT NOT NULL, content_json TEXT NOT NULL, created_at TEXT NOT NULL);
  `,
  `
  CREATE TABLE experience_cases_v7 (id INTEGER PRIMARY KEY, entry_id INTEGER REFERENCES experience_entries(id), title TEXT NOT NULL, situation TEXT NOT NULL DEFAULT '', task TEXT NOT NULL DEFAULT '', actions TEXT NOT NULL DEFAULT '', result TEXT NOT NULL DEFAULT '', skills TEXT NOT NULL DEFAULT '', tools TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '');
  INSERT INTO experience_cases_v7 SELECT * FROM experience_cases;
  CREATE TABLE job_experience_links_v7 (job_id INTEGER NOT NULL REFERENCES jobs(id), case_id INTEGER NOT NULL REFERENCES experience_cases_v7(id), PRIMARY KEY(job_id,case_id));
  INSERT INTO job_experience_links_v7 SELECT * FROM job_experience_links;
  DROP TABLE job_experience_links;
  DROP TABLE experience_cases;
  ALTER TABLE experience_cases_v7 RENAME TO experience_cases;
  ALTER TABLE job_experience_links_v7 RENAME TO job_experience_links;
  `,
  `
  ALTER TABLE day_tasks ADD COLUMN recurrence_id TEXT;
  CREATE TABLE financial_goals (id TEXT PRIMARY KEY,name TEXT NOT NULL,target_cents INTEGER NOT NULL CHECK(target_cents>0),saved_cents INTEGER NOT NULL CHECK(saved_cents>=0),deadline TEXT,active INTEGER NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE weekly_plans (id TEXT PRIMARY KEY,title TEXT NOT NULL,week TEXT NOT NULL,task_id TEXT,status TEXT NOT NULL CHECK(status IN ('open','done')),updated_at TEXT NOT NULL);
  CREATE TABLE recurring_tasks (id TEXT PRIMARY KEY,title TEXT NOT NULL,weekdays_json TEXT NOT NULL,start_day TEXT NOT NULL,active INTEGER NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE recurring_skips (id TEXT PRIMARY KEY,template_id TEXT NOT NULL,day TEXT NOT NULL);
  CREATE TABLE custom_metrics (id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('number','boolean','choice')),unit TEXT NOT NULL,options_json TEXT NOT NULL,active INTEGER NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE metric_entries (id TEXT PRIMARY KEY,metric_id TEXT NOT NULL REFERENCES custom_metrics(id),day TEXT NOT NULL,value_json TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(metric_id,day));
  CREATE INDEX idx_metrics_day ON metric_entries(day);
  CREATE INDEX idx_plans_week ON weekly_plans(week);
  `
];

const starterDatabases=new WeakSet<DB>();
export function seedFinance(db:DB):void {
  db.transaction(()=>{
    if(!(db.prepare('SELECT COUNT(*) AS count FROM finance_accounts').get() as {count:number}).count)db.prepare('INSERT INTO finance_accounts(id,name,opening_cents,active) VALUES (@id,@name,@opening_cents,@active)').run(defaultDebit);
    if(!(db.prepare("SELECT COUNT(*) AS count FROM finance_categories WHERE kind='expense'").get() as {count:number}).count){const insert=db.prepare('INSERT OR IGNORE INTO finance_categories(id,name,kind,active) VALUES (@id,@name,@kind,@active)');for(const row of defaultCategories)insert.run(row);}
  })();
}
export function openDatabase(path: string,options:{seedFinance?:boolean}={}): DB {
  mkdirSync(dirname(path), {recursive:true});
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.function('nexus_id',()=>randomInt(1,2**48));
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const current = (db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get() as {version:number|null}).version ?? 0;
  if (current > schemaVersion) throw new Error('Эта база создана более новой версией NEXUS.');
  if(current>0&&current<schemaVersion&&path!==':memory:')db.prepare('VACUUM INTO ?').run(`${path}.before-v${schemaVersion}-${Date.now()}.backup`);
  for (let v=current+1;v<=schemaVersion;v++) {
    db.transaction(()=>{ db.exec(migrations[v-1]); db.prepare('INSERT INTO schema_migrations(version,applied_at) VALUES (?,?)').run(v,new Date().toISOString()); })();
  }
  if(options.seedFinance){starterDatabases.add(db);seedFinance(db);}
  return db;
}

const backupSchema = z.object({ format: z.literal('nexus-backup'), version: z.number().int().min(1).max(schemaVersion), exportedAt: z.string(), tables: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))) });
export function serializeBackup(db: DB): string {
  const tables: Record<string,unknown[]> = {};
  for (const table of backupTables) tables[table] = db.prepare(`SELECT * FROM ${table}`).all();
  return JSON.stringify({format:'nexus-backup',version:schemaVersion,exportedAt:new Date().toISOString(),tables});
}
export function exportBackup(db: DB, path: string): void {writeFileSync(path,serializeBackup(db),'utf8');}
export function importBackupText(db: DB, content: string): void {
  const parsed = backupSchema.parse(JSON.parse(content));
  for (const table of backupTables) if (!Array.isArray(parsed.tables[table])) {if((['financial_goals','weekly_plans','recurring_tasks','recurring_skips','custom_metrics','metric_entries'].includes(table)&&parsed.version<8)||(table==='daily_journals'&&parsed.version<3)||(table.startsWith('investment_')&&parsed.version<5)||(['day_details','day_tasks','day_memories','assistant_reviews'].includes(table)&&parsed.version<6))parsed.tables[table]=[];else throw new Error(`В копии отсутствует таблица ${table}.`);}
  const allowed = new Map<string,Set<string>>();
  for (const table of backupTables) allowed.set(table,new Set((db.pragma(`table_info(${table})`) as {name:string}[]).map(c=>c.name)));
  db.transaction(()=>{
    for (const table of [...backupTables].reverse()) db.exec(`DELETE FROM ${table}`);
    for (const table of backupTables) for (const row of parsed.tables[table]) {
      const keys = Object.keys(row);
      if (!keys.length || keys.some(k=>!allowed.get(table)?.has(k))) throw new Error(`Некорректные поля таблицы ${table}.`);
      db.prepare(`INSERT INTO ${table} (${keys.map(k=>`"${k}"`).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k] as string|number|null));
    }
    if (parsed.version < 4) db.exec('UPDATE habits SET sort_order=-id');
    db.exec('DELETE FROM daily_journals WHERE id NOT IN (SELECT id FROM daily_journals ORDER BY created_at DESC,id DESC LIMIT 3)');
    if(starterDatabases.has(db))seedFinance(db);
    const violations = db.pragma('foreign_key_check') as unknown[];
    if (violations.length) throw new Error('Резервная копия содержит нарушенные связи.');
  })();
}
export function importBackup(db: DB, path: string): void {importBackupText(db,readFileSync(path,'utf8'));}

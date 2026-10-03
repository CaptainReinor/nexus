import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { openDatabase, schemaVersion, seedFinance, importBackupText, serializeBackup } from './database';
import { WorkRepository } from './work';
import { defaultCategories, defaultDebit, ensureFinanceDefaults, isStarterFinanceRow } from '../shared/finance-defaults';
import type { Snapshot } from '../shared/snapshot-sync';
const folders:string[]=[];
afterEach(()=>{for(const folder of folders.splice(0))rmSync(folder,{recursive:true,force:true});});
it('initializes empty finances once without adding accounts or categories to a customized setup',()=>{
  const db=openDatabase(':memory:',{seedFinance:true});
  try{
    expect(db.prepare('SELECT * FROM finance_accounts').all()).toEqual([defaultDebit]);
    expect(db.prepare('SELECT * FROM finance_categories ORDER BY id').all()).toEqual(defaultCategories);
    seedFinance(db);expect(db.prepare('SELECT COUNT(*) AS n FROM finance_categories').get()).toEqual({n:9});
    expect(isStarterFinanceRow('finance_accounts',defaultDebit)).toBe(true);
    expect(isStarterFinanceRow('finance_accounts',{...defaultDebit,opening_cents:100})).toBe(false);
    db.exec("UPDATE finance_accounts SET name='Моя карта'; UPDATE finance_categories SET name='Моя категория' WHERE id=700000000100;");
    seedFinance(db);expect(db.prepare('SELECT name FROM finance_accounts').get()).toEqual({name:'Моя карта'});
    expect(db.prepare('SELECT COUNT(*) AS n FROM finance_categories').get()).toEqual({n:9});
  }finally{db.close();}
});
it('uses identical default ids on mobile and desktop and fills older empty backups',()=>{
  const empty=openDatabase(':memory:'),db=openDatabase(':memory:',{seedFinance:true});
  try{
    const snapshot=JSON.parse(serializeBackup(empty)) as Snapshot;
    expect(ensureFinanceDefaults(snapshot)).toBe(true);expect(ensureFinanceDefaults(snapshot)).toBe(false);
    importBackupText(db,serializeBackup(empty));
    expect(db.prepare('SELECT * FROM finance_accounts').all()).toEqual(snapshot.tables.finance_accounts);
    expect(db.prepare('SELECT * FROM finance_categories ORDER BY id').all()).toEqual(snapshot.tables.finance_categories);
  }finally{empty.close();db.close();}
});
it('migrates linked cases without deleting vacancy links and accepts independent projects',()=>{
  const folder=mkdtempSync(join(tmpdir(),'nexus-cases-v7-'));folders.push(folder);const path=join(folder,'nexus.sqlite');
  const old=new Database(path);
  old.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);
    INSERT INTO schema_migrations VALUES(6,'2026-09-30');
    CREATE TABLE day_tasks (id TEXT PRIMARY KEY,title TEXT NOT NULL,day TEXT NOT NULL,due_day TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE finance_transactions(id INTEGER PRIMARY KEY,occurred_at TEXT NOT NULL);
    CREATE TABLE jobs(id INTEGER PRIMARY KEY);
    CREATE TABLE experience_entries(id INTEGER PRIMARY KEY);
    CREATE TABLE experience_cases(id INTEGER PRIMARY KEY,entry_id INTEGER NOT NULL REFERENCES experience_entries(id),title TEXT NOT NULL,situation TEXT NOT NULL DEFAULT '',task TEXT NOT NULL DEFAULT '',actions TEXT NOT NULL DEFAULT '',result TEXT NOT NULL DEFAULT '',skills TEXT NOT NULL DEFAULT '',tools TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '');
    CREATE TABLE job_experience_links(job_id INTEGER NOT NULL REFERENCES jobs(id),case_id INTEGER NOT NULL REFERENCES experience_cases(id),PRIMARY KEY(job_id,case_id));
    INSERT INTO jobs VALUES(1);INSERT INTO experience_entries VALUES(2);INSERT INTO experience_cases(id,entry_id,title) VALUES(3,2,'Existing');INSERT INTO job_experience_links VALUES(1,3);`);old.close();
  const db=openDatabase(path);
  try{
    expect(db.prepare('SELECT * FROM job_experience_links').all()).toEqual([{job_id:1,case_id:3}]);
    new WorkRepository(db).saveCase({entry_id:null,title:'Pet project',situation:'',task:'',actions:'',result:'',skills:'',tools:'',tags:''});
    const project=db.prepare("SELECT id,entry_id FROM experience_cases WHERE title='Pet project'").get() as {id:number;entry_id:null};
    expect(project.entry_id).toBeNull();new WorkRepository(db).linkCase(1,project.id,true);
    expect(db.pragma('foreign_key_check')).toEqual([]);expect(readdirSync(folder).some(name=>name.includes(`.before-v${schemaVersion}-`))).toBe(true);
  }finally{db.close();}
});
it('exports and restores an independent case',()=>{
  const db=openDatabase(':memory:'),restored=openDatabase(':memory:');
  try{
    new WorkRepository(db).saveCase({entry_id:null,title:'Independent',situation:'',task:'',actions:'',result:'Finished',skills:'',tools:'',tags:''});
    importBackupText(restored,serializeBackup(db));expect(new WorkRepository(restored).list().cases[0]).toMatchObject({entry_id:null,title:'Independent',result:'Finished'});
  }finally{db.close();restored.close();}
});

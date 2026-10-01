import { getAutostart, setAutostart } from './autostart';
import { requireSecureStorage } from './secure-storage';
import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DB } from './database';
import type { AIUsage, Settings } from '../shared/models';
import { monthOf, localDay } from '../shared/domain';
import { economicalAIModels,resolveAIModels } from '../shared/ai-models';

const defaults = { currency:'RUB', firstDayOfWeek:1, primaryAccountId:null, weeklyTarget:15, aiEnabled:false, aiModelMode:'preset', ...economicalAIModels, aiBudgetCents:1000 } as const;
export class SettingsRepository {
  private keyPath: string;
  constructor(private db: DB, private dbPath: string,private isGuest:()=>boolean=()=>false) { this.keyPath=join(app.getPath('userData'),'openrouter-key.bin'); }
  private value<T>(key: string, fallback: T): T {
    const row=this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as {value:string}|undefined;
    if (!row) return fallback;
    try { return JSON.parse(row.value) as T; } catch { return fallback; }
  }
  get(): Settings {
    const aiModelMode=!this.isGuest()&&this.value<string>('aiModelMode',defaults.aiModelMode)==='custom'?'custom':'preset';
    const models=resolveAIModels(aiModelMode,{cheapModel:this.value('cheapModel',''),standardModel:this.value('standardModel',''),advancedModel:this.value('advancedModel',''),transcriptionModel:this.value('transcriptionModel','')});
    return { autostart: getAutostart(), currency:this.value('currency',defaults.currency), firstDayOfWeek:this.value('firstDayOfWeek',defaults.firstDayOfWeek) as 0|1, primaryAccountId:this.value('primaryAccountId',defaults.primaryAccountId) as number|null, weeklyTarget:this.value('weeklyTarget',defaults.weeklyTarget),aiEnabled:this.value('aiEnabled',defaults.aiEnabled),aiModelMode,...models,aiBudgetCents:this.value('aiBudgetCents',defaults.aiBudgetCents),hasApiKey:existsSync(this.keyPath),dbPath:this.dbPath };
  }
  save(input: Partial<Omit<Settings,'hasApiKey'|'dbPath'>>): void {
    if(this.isGuest()&&(input.aiModelMode==='custom'||Object.keys(input).some(key=>key in economicalAIModels)))throw new Error('Для этого профиля используется готовый набор моделей.');
    if (input.autostart !== undefined) setAutostart(input.autostart);
    for (const [key,value] of Object.entries(input)) if (key !== 'autostart' && key in defaults) this.db.prepare('INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key,JSON.stringify(value));
  }
  setApiKey(key: string): void {
    if (!key.trim()) { if (existsSync(this.keyPath)) rmSync(this.keyPath); return; }
    requireSecureStorage();
    writeFileSync(this.keyPath,safeStorage.encryptString(key.trim()),{mode:0o600});
  }
  getApiKey(): string {
    if (!existsSync(this.keyPath)) throw new Error('Укажите API-ключ OpenRouter в настройках.');
    requireSecureStorage();
    return safeStorage.decryptString(readFileSync(this.keyPath));
  }
  usage(): AIUsage[] { return this.db.prepare('SELECT * FROM ai_usage ORDER BY timestamp DESC LIMIT 500').all() as AIUsage[]; }
  usedMicrousd(): {known:number;unknown:number} {
    const month=monthOf(localDay());
    const row=this.db.prepare(`SELECT COALESCE(SUM(cost_microusd),0) AS known, SUM(CASE WHEN cost_microusd IS NULL AND (status='ok' OR request_id!='' OR input_tokens IS NOT NULL) THEN 1 ELSE 0 END) AS unknown FROM ai_usage WHERE substr(timestamp,1,7)=?`).get(month) as {known:number;unknown:number};
    return row;
  }
}

import type {Row} from './snapshot-sync';

export const journalRetentionDays=30;
export function journalRetentionCutoff(now=Date.now()){return new Date(now-journalRetentionDays*86400000).toISOString();}
export function retainedJournalInputs<T extends Row>(entries:T[],now=Date.now()):T[]{
  const cutoff=now-journalRetentionDays*86400000;
  return entries.filter(row=>{const created=Date.parse(String(row.created_at));return !Number.isFinite(created)||created>=cutoff;})
    .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||Number(b.id)-Number(a.id));
}

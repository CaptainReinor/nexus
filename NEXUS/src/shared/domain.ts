import type { Habit, HabitLog, WeightEntry } from './models';

export function localDay(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}`;
}
export function localDateTime(date = new Date()): string {
  return `${localDay(date)}T${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}:${String(date.getSeconds()).padStart(2,'0')}`;
}
export function monthOf(day: string): string { return day.slice(0, 7); }
export function displayDay(day:string):string { const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(day);return match?`${match[3]}.${match[2]}.${match[1]}`:day; }
export function weekStart(date = new Date(), firstDay: 0|1 = 1): string {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() - firstDay + 7) % 7));
  return localDay(d);
}
export function toCents(raw: string): number {
  const normalized = raw.trim().replace(/\s/g,'').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) throw new Error('Укажите сумму в рублях и копейках.');
  const [whole, fraction = ''] = normalized.split('.');
  const value = Number(whole) * 100 + Number(fraction.padEnd(2,'0'));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Сумма должна быть больше нуля.');
  return value;
}
export function toSignedCents(raw:string):number {
  const normalized=raw.trim().replace(/\s/g,'').replace(',','.');
  if(!/^-?\d+(?:\.\d{1,2})?$/.test(normalized))throw new Error('Укажите корректный начальный баланс.');
  if(Number(normalized)===0)return 0;
  return (normalized.startsWith('-')?-1:1)*toCents(normalized.replace('-',''));
}
export function money(cents: number, currency = 'RUB'): string {
  return new Intl.NumberFormat('ru-RU', { style:'currency', currency, maximumFractionDigits:2 }).format(cents/100);
}
export function habitSuccess(habit: Habit, log?: HabitLog): boolean {
  if (!log || log.status === 'skipped') return false;
  if (habit.kind === 'avoid') return log.value === 0 && log.status === 'done';
  return log.status === 'done' && log.value >= habit.target;
}
// Missing marks become failures only after their day/week has finished.
// Never infer an avoided behaviour actually occurred from an absent mark.
export function habitPeriodState(habit:Habit,logs:HabitLog[],day:string,today=localDay()):'success'|'failure'|'unmarked' {
  const start=habit.period==='weekly'?weekStart(new Date(`${day}T12:00:00`),1):day;
  const cursor=new Date(`${start}T12:00:00`);if(habit.period==='weekly')cursor.setDate(cursor.getDate()+6);
  const end=localDay(cursor),created=habit.created_at.slice(0,10);
  if(start>today||(created&&end<created))return 'unmarked';
  const entries=logs.filter(l=>l.habit_id===habit.id&&l.day>=start&&l.day<=end&&l.day<=today&&(!created||l.day>=created));
  if(entries.some(l=>habitSuccess(habit,l)))return 'success';
  if(end<today||entries.some(l=>l.status==='missed'))return 'failure';
  return 'unmarked';
}
export function habitDueToday(habit: Habit, logs: HabitLog[], today = localDay()): boolean {
  if (!habit.active) return false;
  if (habit.period !== 'weekly') return true;
  const monday = weekStart(new Date(`${today}T12:00:00`), 1);
  return !logs.some(log => log.habit_id === habit.id && log.day >= monday && log.day <= today && habitSuccess(habit, log));
}
export function habitStats(habit: Habit, logs: HabitLog[], today = localDay(),firstDay:0|1=1): { week: number; month: number; streak: number; incidents: number; daysWithout: number } {
  const byDay = new Map(logs.filter(l => l.habit_id === habit.id).map(l => [l.day,l]));
  const startWeek = weekStart(new Date(`${today}T12:00:00`),habit.period==='weekly'?1:firstDay);
  const weekLogs = [...byDay.values()].filter(l => l.day >= startWeek && l.day <= today && habitSuccess(habit,l));
  const monthLogs = [...byDay.values()].filter(l => l.day.startsWith(monthOf(today)) && l.day<=today && habitSuccess(habit,l));
  const week=habit.period==='weekly'?Number(weekLogs.length>0):weekLogs.length;
  const month=habit.period==='weekly'?new Set(monthLogs.map(l=>weekStart(new Date(`${l.day}T12:00:00`),1))).size:monthLogs.length;
  let streak = 0; let daysWithout = 0;
  const cursor = new Date(`${today}T12:00:00`);
  if(habit.period==='weekly'){
    cursor.setTime(new Date(`${startWeek}T12:00:00`).getTime());
    if(!week)cursor.setDate(cursor.getDate()-7);
    for(let i=0;i<52;i++){
      const start=localDay(cursor);const end=new Date(cursor);end.setDate(end.getDate()+6);
      if(![...byDay.values()].some(l=>l.day>=start&&l.day<=localDay(end)&&l.day<=today&&habitSuccess(habit,l)))break;
      streak++;cursor.setDate(cursor.getDate()-7);
    }
  }else for (let i=0;i<366;i++) { const log = byDay.get(localDay(cursor)); if (!log || !habitSuccess(habit,log)) break; streak++; cursor.setDate(cursor.getDate()-1); }
  if (habit.kind === 'avoid') daysWithout = streak;
  const incidents = habit.kind === 'avoid' ? [...byDay.values()].filter(l => l.value > 0).reduce((s,l)=>s+l.value,0) : 0;
  return { week, month, streak, incidents, daysWithout };
}
export function weightStats(entries: WeightEntry[]): { current: number|null; previousDelta: number|null; previousWeekAverage: number|null } {
  const sorted = [...entries].sort((a,b)=>b.day.localeCompare(a.day));
  if (!sorted.length) return { current:null, previousDelta:null, previousWeekAverage:null };
  const current = sorted[0].weight_kg;
  const previousDelta = sorted.length>1 ? +(current-sorted[1].weight_kg).toFixed(2) : null;
  const latest = new Date(`${sorted[0].day}T12:00:00`);
  const to = new Date(`${weekStart(latest)}T12:00:00`);
  const from = new Date(to); from.setDate(from.getDate()-7);
  const previousWeek = sorted.filter(e => e.day >= localDay(from) && e.day < localDay(to));
  return { current, previousDelta, previousWeekAverage: previousWeek.length ? +(previousWeek.reduce((s,e)=>s+e.weight_kg,0)/previousWeek.length).toFixed(2) : null };
}
export function sleepDuration(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh,sm] = start.split(':').map(Number), [eh,em] = end.split(':').map(Number);
  const difference = (eh*60+em)-(sh*60+sm);
  return difference <= 0 ? difference+1440 : difference;
}

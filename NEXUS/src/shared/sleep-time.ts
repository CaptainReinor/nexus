export function normalizeSleepTime(value:string):string|null|undefined{
  const text=value.trim();
  if(!text)return null;
  const match=/^(\d{1,2})[:.](\d{2})$/.exec(text)??/^(\d{2})(\d{2})$/.exec(text);
  if(!match||Number(match[1])>23||Number(match[2])>59)return undefined;
  return `${match[1].padStart(2,'0')}:${match[2]}`;
}

/** Four-part public versions use a valid internal SemVer for Electron/npm. */
export function releaseParts(value:string){
 const m=/^v?(\d+)\.(\d+)\.(\d+)(?:(?:\.|-hotfix\.)(\d+))?$/.exec(value);
 if(!m||m.slice(1).filter(Boolean).some(x=>!Number.isSafeInteger(Number(x))||Number(x)>2147483647))throw Error('Неверный номер обновления.');
 return [Number(m[1]),Number(m[2]),Number(m[3]),Number(m[4]??0)];
}
export function engineVersion(value:string){const [a,b,c,d]=releaseParts(value);return `${a}.${b}.${c}-hotfix.${d}`;}
export function displayVersion(value:string){const [a,b,c,d]=releaseParts(value);return `${a}.${b}.${c}${d?'.'+d:''}`;}

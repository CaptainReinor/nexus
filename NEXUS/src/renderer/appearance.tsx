import {useCallback,useSyncExternalStore} from 'react';
import {appearanceCopy} from './appearance-copy';

export type ThemeId='standard'|'dominion';
export type AppearancePlatform='windows'|'android';
export const appearanceKey='nexus.appearance.theme.v1';
let theme:ThemeId='standard',platform:AppearancePlatform='windows';
const listeners=new Set<()=>void>();
let feedback:()=>void=()=>{};
let transition:ReturnType<typeof setTimeout>|undefined;
export function configureAppearanceFeedback(callback:()=>void){feedback=callback;}
export function readTheme(storage:Pick<Storage,'getItem'>):ThemeId{try{return storage.getItem(appearanceKey)==='dominion'?'dominion':'standard';}catch{return 'standard';}}
declare global{interface Window{nexusCloseSurface?:()=>boolean;}}
export function closeTopSurface(){
  const tooltip=document.querySelector('.metric-delta[aria-describedby]');
  if(tooltip){tooltip.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return true;}
  const dialog=document.activeElement?.closest('dialog[open]')??[...document.querySelectorAll('dialog[open]')].at(-1);
  if(dialog){dialog.dispatchEvent(new Event('cancel',{bubbles:true,cancelable:true}));return true;}
  const modal=[...document.querySelectorAll('.modal[role=dialog]')].at(-1);
  if(modal){modal.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return true;}
  return false;
}
export function initializeAppearance(target:AppearancePlatform){platform=target;try{theme=readTheme(window.localStorage);}catch{theme='standard';}document.documentElement.dataset.theme=theme;document.documentElement.dataset.platform=target;if(target==='android')window.nexusCloseSurface=closeTopSurface;}
const subscribe=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export function useTheme(){return useSyncExternalStore(subscribe,()=>theme,()=> 'standard' as ThemeId);}
export function setTheme(next:ThemeId):boolean{
  if(next!==theme){
    // Keep each scroll container anchored when a shorter label changes its height.
    const scrolling=[document.scrollingElement,...document.querySelectorAll<HTMLElement>('.page,.main,.daily-dialog-body,.modal')].filter((node):node is Element=>!!node&&node.scrollHeight>node.clientHeight);
    const anchors=scrolling.map(container=>{const top=container===document.scrollingElement?0:container.getBoundingClientRect().top;const anchor=[...container.querySelectorAll<HTMLElement>('section,article,h1,h2,label')].find(node=>node.getBoundingClientRect().top>=top&&node.getClientRects().length>0);return {container,anchor,offset:anchor?.getBoundingClientRect().top};});
    document.documentElement.dataset.themeSwitching='true';clearTimeout(transition);transition=setTimeout(()=>{delete document.documentElement.dataset.themeSwitching;},180);
    theme=next;document.documentElement.dataset.theme=next;listeners.forEach(listener=>listener());feedback();
    requestAnimationFrame(()=>anchors.forEach(({container,anchor,offset})=>{if(anchor?.isConnected&&offset!==undefined)container.scrollTop+=anchor.getBoundingClientRect().top-offset;}));
  }
  try{if(localStorage.getItem(appearanceKey)!==next)localStorage.setItem(appearanceKey,next);return true;}catch{return false;}
}
export function useSystemCopy(scope:string){const current=useTheme();return useCallback((source:string)=>current==='standard'?source:(appearanceCopy[scope]?.[source]?.[platform]??source),[current,scope]);}
const navigation={today:['Сводка','Оперативная сводка','Сводка'],health:['Жизнеобеспечение','Жизнеобеспечение','Состояние'],finance:['Ресурсы','Ресурсный контроль','Ресурсы'],work:['Карьера','Кадровые операции','Карьера'],journal:['Журнал','Личный журнал','Журнал'],settings:['Пульт','Командный пульт','Пульт']} as const;
export function useNavigationCopy(){const current=useTheme();return (id:string,standard:string,title=false)=>{const value=navigation[id as keyof typeof navigation];return current==='standard'||!value?standard:value[platform==='android'?2:title?1:0];};}
export function AppearancePanel(){
  const current=useTheme();
  const saved=useSyncExternalStore(errorSubscribe,()=>themeSaved,()=>true);
  return <section className="appearance-panel panel card"><div className="panel-head"><h2>Оформление</h2></div><div className="appearance-options">{(['standard','dominion'] as const).map(value=><label key={value} className={`appearance-option ${current===value?'selected':''}`}><span className={`appearance-preview ${value}`} aria-hidden="true"><i/><span><b/><b/><b/><b/></span></span><span className="appearance-name"><input type="radio" name="nexus-appearance" value={value} checked={current===value} onChange={()=>{themeSaved=setTheme(value);errorListeners.forEach(fn=>fn());}}/>{value==='standard'?'Стандартная':'Доминион'}</span></label>)}</div>{!saved&&<p className="appearance-error" role="alert">Выбор не сохранён после закрытия приложения. <button type="button" onClick={()=>{themeSaved=setTheme(current);errorListeners.forEach(fn=>fn());}}>Повторить</button></p>}</section>;
}
let themeSaved=true;
const errorListeners=new Set<()=>void>();
const errorSubscribe=(listener:()=>void)=>{errorListeners.add(listener);return()=>{errorListeners.delete(listener);};};

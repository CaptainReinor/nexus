import {useSyncExternalStore} from 'react';
const key='nexus.focus.mode.v1',listeners=new Set<()=>void>();
function read(){try{return localStorage.getItem(key)==='on';}catch{return false;}}
export function setFocusMode(enabled:boolean){try{localStorage.setItem(key,enabled?'on':'off');listeners.forEach(fn=>fn());window.dispatchEvent(new Event('nexus:focus-mode'));return true;}catch{return false;}}
export function useFocusMode(){return useSyncExternalStore(fn=>{listeners.add(fn);const update=()=>fn();window.addEventListener('storage',update);return()=>{listeners.delete(fn);window.removeEventListener('storage',update);};},read,()=>false);}

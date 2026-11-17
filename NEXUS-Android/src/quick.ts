import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import type {QuickActions} from '../../NEXUS/src/renderer/return/app';

const native=registerPlugin<{consume():Promise<{kind:string|null}>;pin():Promise<{requested:boolean}>;addListener(event:'quickAction',fn:(data:{kind:string})=>void):Promise<PluginListenerHandle>}>('NexusQuick');
export const quickActions:QuickActions={
  consume:async()=>Capacitor.isNativePlatform()?(await native.consume()).kind:null,
  watch:fn=>{
    if(!Capacitor.isNativePlatform())return()=>{};
    let active=true,listener:PluginListenerHandle|undefined;
    void native.addListener('quickAction',data=>{if(active)fn(data.kind);}).then(async handle=>{listener=handle;if(!active){await handle.remove();return;}const {kind}=await native.consume();if(active&&kind)fn(kind);}).catch(()=>{});
    return()=>{active=false;void listener?.remove();};
  },
  pin:async()=>Capacitor.isNativePlatform()&&(await native.pin()).requested
};

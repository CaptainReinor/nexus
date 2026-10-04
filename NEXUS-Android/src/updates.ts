import { Capacitor,registerPlugin } from '@capacitor/core';
import type { UpdateAPI } from '../../NEXUS/src/shared/updates';
const native=registerPlugin<UpdateAPI>('NexusUpdates');
export const updates:UpdateAPI=Capacitor.isNativePlatform()?native:{
  status:async()=>({phase:'unsupported',currentVersion:'0.7.0',message:'Обновления доступны в приложении Android.'}),
  check:async()=>({phase:'unsupported',currentVersion:'0.7.0',message:'Обновления доступны в приложении Android.'}),
  download:async()=>{throw new Error('Откройте приложение Android.');},
  install:async()=>{throw new Error('Откройте приложение Android.');}
};

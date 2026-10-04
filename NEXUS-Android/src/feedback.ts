import {Capacitor,registerPlugin} from '@capacitor/core';
import {configureFeedback} from '../../NEXUS/src/renderer/feedback';
import {configureAppearanceFeedback} from '../../NEXUS/src/renderer/appearance';
const native=registerPlugin<{pulse(input:{action:'check'|'selection'}):Promise<void>}>('NexusFeedback');
export function initializeFeedback(){configureFeedback(action=>{if(Capacitor.isNativePlatform()&&document.documentElement.dataset.theme==='dominion')return native.pulse({action});});configureAppearanceFeedback(()=>{if(Capacitor.isNativePlatform())void native.pulse({action:'selection'}).catch(()=>{});});}

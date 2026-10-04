import {expect,it} from 'vitest';
import {dailyData} from '../../shared/daily';
import {routineSteps} from './routine-ui';
it('keeps the evening journal while ignoring retired steps in an existing routine',()=>{
 const data=dailyData({format:'nexus-backup',version:11,exportedAt:'',tables:{}});
 data.routines=[{id:'evening',steps_json:'["reflection","journal"]',updated_at:'2026-10-04T12:00:00Z'}];
 const before=structuredClone(data),result=routineSteps(data,'evening');
 expect(result.selected).toEqual(['journal']);expect(result.steps.map(step=>step.id)).toEqual(['journal']);expect(result.candidates.some(step=>step.id==='reflection')).toBe(false);expect(data).toEqual(before);
 data.routines=[];expect(routineSteps(data,'evening').selected).toEqual(['journal']);
});

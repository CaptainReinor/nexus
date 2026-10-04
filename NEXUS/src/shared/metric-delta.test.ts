import {describe,it,expect} from 'vitest';
import {metricComparison,metricDelta} from './metric-delta';
describe('Dominion metric assessment',()=>{
  it('keeps direction independent from distance to an existing goal',()=>{
    expect(metricDelta('weight',78.6,78.2)).toMatchObject({direction:'up',assessment:'unfavorable',text:'↑ +0,4 кг'});
    expect(metricDelta('weight',78.2,78.6)).toMatchObject({direction:'down',assessment:'favorable'});
    expect(metricDelta('weight',78.6,78.2,80)?.assessment).toBe('favorable');
    expect(metricDelta('weight',78.2,77.8,78)?.assessment).toBe('neutral');
    expect(metricDelta('weight',77.6,78.2,78)?.assessment).toBe('unfavorable');
    expect(metricDelta('sleep',480,450,{min:420,max:540})?.assessment).toBe('neutral');
    expect(metricDelta('sleep',600,540,{min:420,max:540})?.assessment).toBe('unfavorable');
  });
  it('does not invent a base or render negative zero and formats minutes',()=>{
    expect(metricDelta('weight',78.2,null)).toBeNull();expect(metricDelta('weight',NaN,78)).toBeNull();
    expect(metricDelta('weight',78.19,78.2)).toMatchObject({delta:0,direction:'flat',assessment:'neutral',text:'→ 0,0 кг'});
    expect(metricDelta('sleep',450,420)?.text).toBe('↑ +30 мин');
    expect(metricDelta('sleep',420,495)?.text).toBe('↓ −1 ч 15 мин');
  });
  it('recomputes the valid preceding record after edits, deletion and date changes',()=>{
    const rows=[{id:3,day:'2026-10-04',value:78.2},{id:2,day:'2026-10-03',value:null},{id:1,day:'2026-09-30',value:78.6},{id:4,day:'2026-10-05',value:77}];
    expect(metricComparison('weight',rows,'2026-10-04').previous?.id).toBe(1);
    expect(metricComparison('weight',rows.filter(x=>x.id!==1),'2026-10-04').previous).toBeUndefined();
    expect(metricComparison('weight',rows.map(x=>x.id===3?{...x,day:'2026-09-29'}:x),'2026-10-04').previous?.id).toBe(3);
    expect(metricComparison('sleep',[{id:'a',day:'2026-10-03',value:480},{id:'b',day:'2026-10-04',value:450}]).previous?.value).toBe(480);
  });
});

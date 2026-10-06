import {describe,it,expect} from 'vitest';
import {carryChartValues} from './chart-series';
describe('last known chart values',()=>{
  it('fills absent and empty days, then uses the new measurement without editing input',()=>{
    const input=[{day:'2026-10-02',value:145},{day:'2026-10-04',value:null},{day:'2026-10-05',value:147}];
    expect(carryChartValues(input,'2026-10-06')).toEqual([
      {day:'2026-10-02',value:145},{day:'2026-10-03',value:145},{day:'2026-10-04',value:145},
      {day:'2026-10-05',value:147},{day:'2026-10-06',value:147}]);
    expect(input).toHaveLength(3);expect(input[1].value).toBeNull();
  });
  it('preserves unknown beginnings and real zero portfolio values across month boundaries',()=>{
    expect(carryChartValues([{day:'2026-10-02',value:1200},{day:'2026-09-30',value:0},{day:'2026-09-29',value:null}])).toEqual([
      {day:'2026-09-29',value:null},{day:'2026-09-30',value:0},{day:'2026-10-01',value:0},{day:'2026-10-02',value:1200}]);
    expect(carryChartValues([])).toEqual([]);
  });
});

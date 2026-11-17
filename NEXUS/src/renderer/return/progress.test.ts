import {expect,it} from 'vitest';
import {weekTrail,receiptTitle} from './progress';
import {returnFixture} from './fixture.test-utils';

it('shows weekly progress from unique actual recording days and excludes future records',()=>{
 const {snapshot}=returnFixture();snapshot.tables.weight_entries=[{id:1,day:'2026-11-16',weight_kg:84},{id:2,day:'2026-11-16',weight_kg:84.1},{id:3,day:'2026-11-18',weight_kg:83}];
 const trail=weekTrail(snapshot,'2026-11-17');expect(trail.filter(r=>r.recorded)).toHaveLength(1);expect(trail[0].done).toBe(1);expect(trail[2].recorded).toBe(false);
});
it('describes a saved message with no extracted actions without inventing statistics',()=>{
 expect(receiptTitle({id:crypto.randomUUID(),day:'2026-11-17',text:'Привет',reply:'Привет',actions:[],replace:false,expectedUpdatedAt:null})).toEqual({title:'Запись сохранена',value:''});
});

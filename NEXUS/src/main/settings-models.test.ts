import {expect,it,vi} from 'vitest';
vi.mock('electron',()=>({app:{getPath:()=>'/unused-nexus-test',getLoginItemSettings:()=>({openAtLogin:false})},safeStorage:{}}));
import {openDatabase} from './database';
import {SettingsRepository} from './settings';
import {economicalAIModels} from '../shared/ai-models';
it('switches existing owner models to the preset without destroying the saved manual configuration',()=>{
 const db=openDatabase(':memory:');try{
  const settings=new SettingsRepository(db,':memory:');
  settings.save({cheapModel:'old/expensive',standardModel:'old/analysis'});
  expect(settings.get()).toMatchObject({aiModelMode:'preset',...economicalAIModels});
  settings.save({aiModelMode:'custom'});expect(settings.get()).toMatchObject({cheapModel:'old/expensive',standardModel:'old/analysis'});
  settings.save({aiModelMode:'preset'});expect(settings.get().cheapModel).toBe(economicalAIModels.cheapModel);
  settings.save({aiModelMode:'custom'});expect(settings.get().cheapModel).toBe('old/expensive');
 }finally{db.close();}
});
it('enforces the guest preset even when synced data contains owner custom settings',()=>{
 const db=openDatabase(':memory:');try{
  new SettingsRepository(db,':memory:').save({aiModelMode:'custom',cheapModel:'old/expensive'});
  const guest=new SettingsRepository(db,':memory:',()=>true);
  expect(guest.get()).toMatchObject({aiModelMode:'preset',...economicalAIModels});
  expect(()=>guest.save({cheapModel:'override/model'})).toThrow('готовый набор');
  expect(()=>guest.save({aiModelMode:'custom'})).toThrow('готовый набор');
  guest.save({aiEnabled:true});expect(guest.get().aiEnabled).toBe(true);
 }finally{db.close();}
});

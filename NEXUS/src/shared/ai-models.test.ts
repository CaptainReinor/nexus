import {expect,it} from 'vitest';
import {economicalAIModels,resolveAIModels} from './ai-models';
it('uses the economical preset for existing expensive configurations unless the owner opts into custom models',()=>{
  const stored={cheapModel:'expensive/old-model',standardModel:'expensive/other-model'};
  expect(resolveAIModels(undefined,stored)).toEqual(economicalAIModels);
  expect(resolveAIModels('preset',stored)).toEqual(economicalAIModels);
  expect(resolveAIModels('custom',stored).cheapModel).toBe(stored.cheapModel);
  expect(resolveAIModels('custom',stored,true)).toEqual(economicalAIModels);
  expect(resolveAIModels('custom',{cheapModel:'  '}).cheapModel).toBe(economicalAIModels.cheapModel);
  expect(stored.cheapModel).toBe('expensive/old-model');
});

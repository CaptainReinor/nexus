import { expect,it,vi } from 'vitest';
import { ProfileAIProvider } from './profile-ai';
import { OpenRouterAuthenticationError,type AIProvider } from './ai';
import type { RemoteBackupService } from './remote-backup';

function setup(guest=true){
  const remote={isGuest:()=>guest,deviceAIKey:vi.fn().mockResolvedValue('issued'),clearDeviceAIKey:vi.fn()};
  const direct={test:vi.fn().mockResolvedValue(true),complete:vi.fn(),transcribe:vi.fn()};
  return {remote,direct,provider:new ProfileAIProvider(remote as unknown as RemoteBackupService,direct as AIProvider)};
}
it('uses the issued guest key even if an old manual key exists',async()=>{
  const {remote,direct,provider}=setup();await provider.test('wrong-old-key');
  expect(remote.deviceAIKey).toHaveBeenCalledOnce();expect(direct.test).toHaveBeenCalledWith('issued');
});
it('retains the owner manual key preference',async()=>{
  const {remote,direct,provider}=setup(false);await provider.test('manual');
  expect(remote.deviceAIKey).not.toHaveBeenCalled();expect(direct.test).toHaveBeenCalledWith('manual');
});
it('invalidates a revoked issued key without retrying a potentially paid request',async()=>{
  const {remote,direct,provider}=setup();direct.complete.mockRejectedValue(new OpenRouterAuthenticationError('revoked'));
  await expect(provider.complete('','model','system','user',false)).rejects.toThrow('revoked');
  expect(remote.clearDeviceAIKey).toHaveBeenCalledOnce();expect(direct.complete).toHaveBeenCalledOnce();
});
it('keeps a valid cached key when the provider blocks the network',async()=>{
  const {remote,direct,provider}=setup();direct.test.mockRejectedValue(new Error('network blocked'));
  await expect(provider.test('')).rejects.toThrow('network blocked');expect(remote.clearDeviceAIKey).not.toHaveBeenCalled();
});

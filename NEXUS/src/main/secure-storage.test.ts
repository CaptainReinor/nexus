import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({available:true,backend:'gnome_libsecret'}));
vi.mock('electron',()=>({safeStorage:{isEncryptionAvailable:()=>state.available,getSelectedStorageBackend:()=>state.backend}}));
import { requireSecureStorage } from './secure-storage';
beforeEach(()=>{state.available=true;state.backend='gnome_libsecret';});
it('rejects Linux fallback encryption even when Electron reports encryption available',()=>{
  state.backend='basic_text';expect(()=>requireSecureStorage('linux')).toThrow('связка ключей');
  state.backend='unknown';expect(()=>requireSecureStorage('linux')).toThrow('связка ключей');
});
it('allows Linux keyring and preserves Windows protection',()=>{
  expect(()=>requireSecureStorage('linux')).not.toThrow();
  state.backend='kwallet6';expect(()=>requireSecureStorage('linux')).not.toThrow();
  state.backend='unknown';expect(()=>requireSecureStorage('win32')).not.toThrow();
  state.available=false;expect(()=>requireSecureStorage('win32')).toThrow('недоступно');
});

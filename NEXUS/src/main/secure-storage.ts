import { safeStorage } from 'electron';

export function requireSecureStorage(platform:NodeJS.Platform=process.platform):void {
  if(!safeStorage.isEncryptionAvailable())throw new Error('Защищённое хранилище системы недоступно. В Linux разблокируйте связку ключей и перезапустите NEXUS.');
  // Electron's basic_text backend uses a fixed password: it cannot protect credentials.
  if(platform==='linux'){
    const backend=safeStorage.getSelectedStorageBackend();
    if(backend==='basic_text'||backend==='unknown')throw new Error('В Linux недоступна защищённая связка ключей. Разблокируйте её и перезапустите NEXUS, чтобы подключить сервер или ИИ.');
  }
}

import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

type Environment = { platform: NodeJS.Platform; configHome: string; executable: string };
function environment(): Environment {
  const configHome=process.env.XDG_CONFIG_HOME;
  return {platform:process.platform,configHome:configHome&&isAbsolute(configHome)?configHome:join(homedir(),'.config'),executable:process.env.APPIMAGE||process.execPath};
}
function file(env:Environment):string { return join(env.configHome,'autostart','ru.nexus.desktop.desktop'); }
function desktopCommand(executable:string):string {
  if(!isAbsolute(executable)||/[\r\n\0]/.test(executable))throw new Error('Не удалось определить путь приложения для автозапуска.');
  // Exec quoting and then Desktop Entry string escaping. Never invoke a shell.
  return `"${executable.replace(/[\\"`$]/g,character=>`\\${character}`).replace(/\\/g,'\\\\')}"`;
}
export function getAutostart(env:Environment=environment()):boolean {
  if(env.platform!=='linux')return app.getLoginItemSettings().openAtLogin;
  if(!existsSync(file(env)))return false;
  const contents=readFileSync(file(env),'utf8');
  return /^Exec=/m.test(contents)&&!/^Hidden\s*=\s*true\s*$/m.test(contents)&&!/^X-GNOME-Autostart-enabled\s*=\s*false\s*$/m.test(contents);
}
export function setAutostart(enabled:boolean,env:Environment=environment()):void {
  if(env.platform!=='linux'){app.setLoginItemSettings({openAtLogin:enabled});return;}
  if(!enabled){rmSync(file(env),{force:true});return;}
  const command=desktopCommand(env.executable);
  mkdirSync(join(env.configHome,'autostart'),{recursive:true});
  writeFileSync(file(env),`[Desktop Entry]\nType=Application\nName=NEXUS\nExec=${command}\nTerminal=false\nX-GNOME-Autostart-enabled=true\n`,{mode:0o600});
}

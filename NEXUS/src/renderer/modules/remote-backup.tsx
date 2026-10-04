import {useSystemCopy} from '../appearance';
import { defaultServerEndpoint } from '../../shared/accounts';
import { askConfirm } from '../confirm';
import { useEffect, useState } from 'react';
import type { RemoteBackupInfo } from '../../shared/models';
import { Field, Notice, Panel, errorText, useData } from '../ui';

export function RemoteBackupPanel({beforeAction,onRestored}:{beforeAction:()=>Promise<boolean>;onRestored:()=>void}){
  const copy=useSystemCopy("remote-backup");

  const {data:config,reload}=useData(window.nexus.data.remoteConfig);
  const profile=useData(window.nexus.accounts.profile);
  const endpoint=config?.endpoint||defaultServerEndpoint;
  const [token,setToken]=useState(''),[passphrase,setPassphrase]=useState('');
  const [backupSetup,setBackupSetup]=useState(false);
  const [editing,setEditing]=useState(false),[items,setItems]=useState<RemoteBackupInfo[]>([]),[busy,setBusy]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{if(config?.configured)void refresh();},[config?.configured,config?.lastUploadedAt]);
  useEffect(()=>{if(!config?.configured)return;const timer=setInterval(()=>{void reload();},10_000);return ()=>clearInterval(timer);},[config?.configured,reload]);

  async function refresh(){try{setItems((await window.nexus.data.remoteList()).slice(0,5));}catch(e){setNotice(errorText(e));}}
  async function configure(){setBusy('configure');try{await window.nexus.data.configureRemote({endpoint,token,passphrase});setToken('');setPassphrase('');setEditing(false);await reload();await refresh();setNotice('Подключено.');}catch(e){setNotice(errorText(e));}finally{setBusy('');}}
  async function enableBackups(){setBusy('backups');try{await window.nexus.data.setBackupPassphrase(passphrase);setPassphrase('');setBackupSetup(false);await reload();setNotice('Зашифрованные резервные копии включены. Сохраните пароль для восстановления.');}catch(e){setNotice(errorText(e));}finally{setBusy('');}}
  async function upload(){if(!await beforeAction()){setNotice('Сначала исправьте ошибку локального сохранения.');return;}setBusy('upload');try{await window.nexus.data.remoteUpload();await reload();await refresh();setNotice('Зашифрованная копия загружена.');}catch(e){setNotice(errorText(e));}finally{setBusy('');}}
  async function copyToken(){try{await window.nexus.data.copyRemoteToken();setNotice('Код скопирован.');}catch(e){setNotice(errorText(e));}}
  async function enableAndroidAI(){setBusy('ai');try{await window.nexus.data.enableAndroidAI();setNotice('AI для Android подключён через ваш сервер.');}catch(e){setNotice(errorText(e));}finally{setBusy('');}}
  async function restore(item:RemoteBackupInfo){if(!(await askConfirm(`Восстановить копию от ${new Date(item.createdAt).toLocaleString('ru-RU')}? Текущая база сначала будет сохранена локально.`)))return;if(!await beforeAction()){setNotice('Сначала исправьте ошибку локального сохранения.');return;}setBusy(item.id);try{await window.nexus.data.remoteRestore(item.id);onRestored();}catch(e){setNotice(errorText(e));}finally{setBusy('');}}

  return <Panel title={copy("Сервер и синхронизация")} className="remote-backup-panel">

    {notice&&<Notice message={notice} onClose={()=>setNotice('')}/>}
    {(!config?.configured||editing)&&<div className="form-stack">

      <Field label="Код доступа"><input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)}/></Field>
      <details><summary>{copy("Резервные копии")}</summary><Field label="Пароль для резервных копий" hint="Не менее 16 символов."><input type="password" autoComplete="new-password" value={passphrase} onChange={e=>setPassphrase(e.target.value)}/></Field></details>
      <div className="button-row"><button type="button" className="button primary small" disabled={!!busy||!token||!!passphrase&&passphrase.length<16} onClick={()=>void configure()}>{busy==='configure'?'Подключение…':'Подключить'}</button>{config?.configured&&<button type="button" className="button ghost small" onClick={()=>setEditing(false)}>Отмена</button>}</div>
    </div>}
    {config?.configured&&!editing&&<><p className="key-status"><span className="indicator on"/>Подключено</p><p className="muted">Данные: {config.lastSyncedRevision===null?'ожидается':`версия ${config.lastSyncedRevision}`}.{config.encryptedCopiesEnabled&&<> Копия: {config.lastUploadedAt?new Date(config.lastUploadedAt).toLocaleString('ru-RU'):'ожидается'}.</>}</p>{config.autoError&&<p className="help-warning">Ошибка сервера: {config.autoError} Повторная попытка будет автоматически.</p>}<div className="button-row">{config.encryptedCopiesEnabled?<button type="button" className="button primary small" disabled={!!busy} onClick={()=>void upload()}>{busy==='upload'?'Загрузка…':'Загрузить копию'}</button>:<button type="button" className="button secondary small" disabled={!!busy} onClick={()=>setBackupSetup(!backupSetup)}>Настроить резервные копии</button>}<button type="button" className="button secondary small" disabled={!!busy} onClick={()=>void refresh()}>Обновить список</button><button type="button" className="button secondary small" disabled={!!busy} onClick={()=>void copyToken()}>Скопировать код</button>{profile.data?.role==='owner'&&<button type="button" className="button secondary small" disabled={!!busy} onClick={()=>void enableAndroidAI()}>Подключить AI на телефоне</button>}<button type="button" className="button ghost small" disabled={!!busy} onClick={()=>setEditing(true)}>Изменить подключение</button></div>
      {backupSetup&&<div className="form-stack"><Field label="Пароль для резервных копий" hint="Не менее 16 символов."><input type="password" autoComplete="new-password" value={passphrase} onChange={e=>setPassphrase(e.target.value)}/></Field><button type="button" className="button secondary small" disabled={!!busy||passphrase.length<16} onClick={()=>void enableBackups()}>Включить резервные копии</button></div>}

      {items.length?<div className="compact-list remote-backup-list">{items.map(item=><div key={item.id}><span>{new Date(item.createdAt).toLocaleString('ru-RU')}</span><strong>{(item.size/1024).toFixed(0)} КБ</strong><button type="button" className="button ghost small" disabled={!!busy||!config.encryptedCopiesEnabled} onClick={()=>void restore(item)}>{busy===item.id?'Восстановление…':'Восстановить'}</button></div>)}</div>:config.encryptedCopiesEnabled&&<p className="muted">{copy("Копий пока нет.")}</p>}
    </>}
  </Panel>;
}

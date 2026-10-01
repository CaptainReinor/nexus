import { askConfirm } from '../confirm';
import { useEffect, useState } from 'react';
import type { RemoteBackupInfo } from '../../shared/models';
import { Field, Notice, Panel, errorText, useData } from '../ui';

export function RemoteBackupPanel({beforeAction,onRestored}:{beforeAction:()=>Promise<boolean>;onRestored:()=>void}){
  const {data:config,reload}=useData(window.nexus.data.remoteConfig);
  const profile=useData(window.nexus.accounts.profile);
  const [endpoint,setEndpoint]=useState('');
  const [token,setToken]=useState(''),[passphrase,setPassphrase]=useState('');
  const [backupSetup,setBackupSetup]=useState(false);
  const [editing,setEditing]=useState(false),[items,setItems]=useState<RemoteBackupInfo[]>([]),[busy,setBusy]=useState(''),[notice,setNotice]=useState('');
  useEffect(()=>{if(config?.endpoint)setEndpoint(config.endpoint);},[config?.endpoint]);
  useEffect(()=>{if(config?.configured)void refresh();},[config?.configured,config?.lastUploadedAt]);
  useEffect(()=>{if(!config?.configured)return;const timer=setInterval(()=>{void reload();},10_000);return ()=>clearInterval(timer);},[config?.configured,reload]);

  async function refresh(){try{setItems((await window.nexus.data.remoteList()).slice(0,5));}catch(e){setNotice(errorText(e));}}
  async function configure(){setBusy('configure');try{await window.nexus.data.configureRemote({endpoint,token,passphrase});setToken('');setPassphrase('');setEditing(false);await reload();await refresh();setNotice('Подключение к серверу сохранено.');}catch(e){setNotice(errorText(e));}finally{setBusy('');}}
  async function enableBackups(){setBusy('backups');try{await window.nexus.data.setBackupPassphrase(passphrase);setPassphrase('');setBackupSetup(false);await reload();setNotice('Зашифрованные резервные копии включены. Сохраните пароль для восстановления.');}catch(e){setNotice(errorText(e));}finally{setBusy('');}}
  async function upload(){if(!await beforeAction()){setNotice('Сначала исправьте ошибку локального сохранения.');return;}setBusy('upload');try{await window.nexus.data.remoteUpload();await reload();await refresh();setNotice('Зашифрованная копия загружена.');}catch(e){setNotice(errorText(e));}finally{setBusy('');}}
  async function copyToken(){try{await window.nexus.data.copyRemoteToken();setNotice('Ключ скопирован для своего телефона. Для друзей создавайте отдельные приглашения.');}catch(e){setNotice(errorText(e));}}
  async function enableAndroidAI(){setBusy('ai');try{await window.nexus.data.enableAndroidAI();setNotice('AI для Android подключён через ваш сервер.');}catch(e){setNotice(errorText(e));}finally{setBusy('');}}
  async function restore(item:RemoteBackupInfo){if(!(await askConfirm(`Восстановить копию от ${new Date(item.createdAt).toLocaleString('ru-RU')}? Текущая база сначала будет сохранена локально.`)))return;if(!await beforeAction()){setNotice('Сначала исправьте ошибку локального сохранения.');return;}setBusy(item.id);try{await window.nexus.data.remoteRestore(item.id);onRestored();}catch(e){setNotice(errorText(e));}finally{setBusy('');}}

  return <Panel eyebrow="08 / СЕРВЕР" title="Сервер и синхронизация" className="remote-backup-panel">
    <p className="muted">Изменения отправляются в фоне. Сервер сообщает об обновлениях с других устройств через постоянное соединение.</p>
    {notice&&<Notice message={notice} onClose={()=>setNotice('')}/>}
    {(!config?.configured||editing)&&<div className="form-stack">
      <Field label="Адрес сервера HTTPS"><input value={endpoint} onChange={e=>setEndpoint(e.target.value)} placeholder="https://example.com/nexus-api"/></Field>
      <Field label="Ключ доступа или код приглашения"><input type="password" autoComplete="off" value={token} onChange={e=>setToken(e.target.value)}/></Field>
      <details><summary>Резервные копии · необязательно</summary><Field label="Пароль для резервных копий" hint="Не менее 16 символов. Сохраните его: он нужен для восстановления зашифрованной копии."><input type="password" autoComplete="new-password" value={passphrase} onChange={e=>setPassphrase(e.target.value)}/></Field></details>
      <div className="button-row"><button type="button" className="button primary small" disabled={!!busy||!token||!!passphrase&&passphrase.length<16} onClick={()=>void configure()}>{busy==='configure'?'Подключение…':'Подключить сервер'}</button>{config?.configured&&<button type="button" className="button ghost small" onClick={()=>setEditing(false)}>Отмена</button>}</div>
    </div>}
    {config?.configured&&!editing&&<><p className="muted">Подключено: {config.endpoint}</p><p className="muted">Синхронизация: {config.lastSyncedRevision===null?'ожидается':`версия ${config.lastSyncedRevision}`}.{config.encryptedCopiesEnabled&&<> Последняя зашифрованная копия: {config.lastUploadedAt?new Date(config.lastUploadedAt).toLocaleString('ru-RU'):'ожидается'}.</>}</p>{config.autoError&&<p className="help-warning">Ошибка сервера: {config.autoError} Повторная попытка будет автоматически.</p>}<div className="button-row">{config.encryptedCopiesEnabled?<button type="button" className="button primary small" disabled={!!busy} onClick={()=>void upload()}>{busy==='upload'?'Загрузка…':'Загрузить копию'}</button>:<button type="button" className="button secondary small" disabled={!!busy} onClick={()=>setBackupSetup(!backupSetup)}>Настроить резервные копии</button>}<button type="button" className="button secondary small" disabled={!!busy} onClick={()=>void refresh()}>Обновить список</button><button type="button" className="button secondary small" disabled={!!busy} onClick={()=>void copyToken()}>Скопировать ключ для телефона</button>{profile.data?.role==='owner'&&<button type="button" className="button secondary small" disabled={!!busy} onClick={()=>void enableAndroidAI()}>Подключить AI на телефоне</button>}<button type="button" className="button ghost small" disabled={!!busy} onClick={()=>setEditing(true)}>Изменить подключение</button></div>
      {backupSetup&&<div className="form-stack"><Field label="Пароль для резервных копий" hint="Не менее 16 символов. Для обычной синхронизации пароль не нужен."><input type="password" autoComplete="new-password" value={passphrase} onChange={e=>setPassphrase(e.target.value)}/></Field><button type="button" className="button secondary small" disabled={!!busy||passphrase.length<16} onClick={()=>void enableBackups()}>Включить резервные копии</button></div>}
      {config.encryptedCopiesEnabled&&<p className="muted">Хранятся последние пять зашифрованных копий. Новая отправляется при изменениях, не чаще раза в пять минут.</p>}
      {items.length?<div className="compact-list remote-backup-list">{items.map(item=><div key={item.id}><span>{new Date(item.createdAt).toLocaleString('ru-RU')}</span><strong>{(item.size/1024).toFixed(0)} КБ</strong><button type="button" className="button ghost small" disabled={!!busy||!config.encryptedCopiesEnabled} onClick={()=>void restore(item)}>{busy===item.id?'Восстановление…':'Восстановить'}</button></div>)}</div>:<p className="muted">{config.encryptedCopiesEnabled?'Копий на сервере пока нет.':'Синхронизация работает без отдельного пароля.'}</p>}
    </>}
  </Panel>;
}

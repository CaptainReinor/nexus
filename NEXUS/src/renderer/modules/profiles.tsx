import { useEffect,useState } from 'react';
import type { RemoteProfile,UserInvitation } from '../../shared/accounts';
import { Field,Panel,Notice,errorText,useData } from '../ui';

export function AccountsPanel(){
  const config=useData(window.nexus.data.remoteConfig);
  const management=useData(window.nexus.accounts.managementStatus);
  const [managementKey,setManagementKey]=useState('');
  const [editingManagement,setEditingManagement]=useState(false);
  const [hiddenIds,setHiddenIds]=useState<string[]>(()=>{try{const value:unknown=JSON.parse(localStorage.getItem('nexus.hidden-accesses')??'[]');return Array.isArray(value)?value.filter((id):id is string=>typeof id==='string'):[];}catch{return [];}});
  function hide(user:RemoteProfile){const next=hiddenIds.includes(user.id)?hiddenIds.filter(id=>id!==user.id):[...hiddenIds,user.id];setHiddenIds(next);localStorage.setItem('nexus.hidden-accesses',JSON.stringify(next));if(invitation?.user.id===user.id)setInvitation(null);}
  const [profile,setProfile]=useState<RemoteProfile|null>(null),[users,setUsers]=useState<RemoteProfile[]>([]),[name,setName]=useState(''),[invitation,setInvitation]=useState<UserInvitation|null>(null),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  async function refresh(){try{const p=await window.nexus.accounts.profile();setProfile(p);if(p?.role==='owner')setUsers(await window.nexus.accounts.list());}catch(e){setNotice(errorText(e));}}
  useEffect(()=>{if(config.data?.configured)void refresh();},[config.data?.configured]);
  async function create(){setBusy(true);try{setInvitation(await window.nexus.accounts.create({name,monthlyLimitCents:50}));setName('');await refresh();}catch(e){setNotice(errorText(e));}finally{setBusy(false);}}
  async function saveManagement(){setBusy(true);try{await window.nexus.accounts.setManagementKey(managementKey);setManagementKey('');setEditingManagement(false);await management.reload();setNotice('Автоматическая выдача ключей подключена.');}catch(e){setNotice(errorText(e));}finally{setBusy(false);}}
  async function toggle(user:RemoteProfile){setBusy(true);try{await window.nexus.accounts.update({id:user.id,active:!user.active});await refresh();}catch(e){setNotice(errorText(e));}finally{setBusy(false);}}
  async function showCode(user:RemoteProfile){setBusy(true);try{setInvitation(await window.nexus.accounts.invitation(user.id));}catch(e){setNotice(errorText(e));}finally{setBusy(false);}}
  async function copyCode(){try{await navigator.clipboard.writeText(code);setNotice('Код скопирован.');}catch{setNotice('Не удалось скопировать. Выделите код и скопируйте вручную.');}}
  const userRow=(user:RemoteProfile)=><div className="compact-list" key={user.id}><div><strong>{user.name}</strong><span>{user.usedMicrousd===undefined?'Расход недоступен':`$${(user.usedMicrousd/1_000_000).toFixed(4)}`} / ${((user.monthlyLimitCents??0)/100).toFixed(2)}</span><button type="button" className="button secondary small" disabled={busy} onClick={()=>void showCode(user)}>Показать код</button><button type="button" className="button ghost small" disabled={busy} onClick={()=>void toggle(user)}>{user.active?'Отключить доступ и AI':'Восстановить доступ и AI'}</button>{user.active&&<button type="button" className="button ghost small" onClick={()=>hide(user)}>{hiddenIds.includes(user.id)?'Вернуть в список':'Скрыть'}</button>}</div></div>;
  if(!config.data?.configured||profile?.role!=='owner')return null;
  const code=invitation?(invitation.code??JSON.stringify({format:'nexus-invite',version:1,name:invitation.user.name,endpoint:invitation.endpoint,token:invitation.token})):'';
  return <Panel eyebrow="ДОСТУП" title="Доступы друзей" className="settings-wide">
    {notice&&<Notice message={notice} onClose={()=>setNotice('')}/>}
    <>

      <div className="form-stack">
        {management.data?.configured&&!editingManagement?<><p className="key-status"><span className="indicator on"/>Автоматическая выдача ключей подключена</p><button type="button" className="button ghost small" disabled={busy} onClick={()=>setEditingManagement(true)}>Заменить ключ управления</button></>:<>
          <Field label="Ключ управления OpenRouter" hint="Хранится только на этом ПК."><input type="password" autoComplete="off" value={managementKey} onChange={e=>setManagementKey(e.target.value)}/></Field>
          <button type="button" className="button secondary small" disabled={busy||!managementKey.trim()} onClick={()=>void saveManagement()}>Подключить выдачу ключей</button>
        </>}
        <Field label="Имя друга"><input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></Field>
        <button type="button" disabled={busy||!name.trim()||!management.data?.configured} className="button secondary small" onClick={()=>void create()}>{busy?'Подготовка…':'Создать код'}</button>
      </div>
      {invitation&&<><Field label={`Код для ${invitation.user.name}`} hint="Передайте только этому человеку."><textarea readOnly rows={2} value={code} onFocus={e=>e.target.select()} spellCheck={false}/></Field><div className="button-row"><button type="button" className="button secondary small" onClick={()=>void copyCode()}>Скопировать код</button><button type="button" className="button ghost small" onClick={()=>setInvitation(null)}>Скрыть код</button></div></>}
      {users.filter(user=>user.active&&!hiddenIds.includes(user.id)).map(userRow)}
      {users.some(user=>!user.active||hiddenIds.includes(user.id))&&<details className="section-fold"><summary>Скрытые и неактивные доступы · {users.filter(user=>!user.active||hiddenIds.includes(user.id)).length}</summary>{users.filter(user=>!user.active||hiddenIds.includes(user.id)).map(userRow)}</details>}
    </>
  </Panel>;
}

import { useEffect,useState } from 'react';
import type { RemoteProfile,UserInvitation } from '../../shared/accounts';
import { Field,Panel,Notice,errorText,useData } from '../ui';

export function ProfilesPanel({beforeAction}:{beforeAction:()=>Promise<boolean>}){
  const profiles=useData(window.nexus.profiles.list);
  const [name,setName]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
  async function create(){setBusy(true);try{await window.nexus.profiles.create(name);setName('');await profiles.reload();}catch(e){setNotice(errorText(e));}finally{setBusy(false);}}
  async function select(id:string){if(id===profiles.data?.active)return;setBusy(true);try{if(!await beforeAction())return;await window.nexus.profiles.select(id);}catch(e){setNotice(errorText(e));}finally{setBusy(false);}}
  return <Panel eyebrow="ПРОФИЛИ" title="Пользователи на этом компьютере"><p className="muted">У каждого профиля своя база и свои настройки подключения. При переключении NEXUS перезапустится.</p>{notice&&<Notice message={notice} onClose={()=>setNotice('')}/>}{profiles.error&&<p className="error">{profiles.error}</p>}<Field label="Текущий профиль"><select disabled={busy} value={profiles.data?.active??'local'} onChange={e=>void select(e.target.value)}>{profiles.data?.profiles.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><div className="form-row"><Field label="Новый профиль"><input value={name} maxLength={80} onChange={e=>setName(e.target.value)} placeholder="Имя пользователя"/></Field><button type="button" className="button secondary small" disabled={busy||!name.trim()} onClick={()=>void create()}>Создать профиль</button></div></Panel>;
}

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
  if(!config.data?.configured)return null;
  const code=invitation?(invitation.code??JSON.stringify({format:'nexus-invite',version:1,name:invitation.user.name,endpoint:invitation.endpoint,token:invitation.token})):'';
  return <Panel eyebrow="ДОСТУП" title={profile?.role==='guest'?'Мой доступ к AI':'Друзья и AI'}>
    {notice&&<Notice message={notice} onClose={()=>setNotice('')}/>}
    {profile?.role==='guest'?<><p>{profile.name}</p><p className="muted">Персональный ключ OpenRouter. Лимит: ${((profile.monthlyLimitCents??0)/100).toFixed(2)} в месяц. Запросы идут с этого устройства; VPN должен быть включён.</p></>:profile?.role==='owner'?<>
      <p className="muted">У каждого друга отдельная база и свой ключ OpenRouter с лимитом $0,50 в месяц. Лимит сбрасывается автоматически. Запросы идут с телефона или ПК друга через его VPN.</p>
      <div className="form-stack">
        {management.data?.configured&&!editingManagement?<><p className="key-status"><span className="indicator on"/>Автоматическая выдача ключей подключена</p><button type="button" className="button ghost small" disabled={busy} onClick={()=>setEditingManagement(true)}>Заменить ключ управления</button></>:<>
          <Field label="Ключ управления OpenRouter" hint="Management API Key хранится защищённо только на этом ПК. Он не передаётся друзьям или на сервер."><input type="password" autoComplete="off" value={managementKey} onChange={e=>setManagementKey(e.target.value)}/></Field>
          <button type="button" className="button secondary small" disabled={busy||!managementKey.trim()} onClick={()=>void saveManagement()}>Подключить выдачу ключей</button>
        </>}
        <Field label="Имя друга"><input maxLength={80} value={name} onChange={e=>setName(e.target.value)}/></Field>
        <button type="button" disabled={busy||!name.trim()||!management.data?.configured} className="button secondary small" onClick={()=>void create()}>{busy?'Подготовка…':'Создать приглашение · $0,50/мес.'}</button>
      </div>
      {invitation&&<><Field label={`Код для ${invitation.user.name}`} hint="Передай код только этому человеку. Он вставит его в настройках подключения на телефоне или ПК. Коды всех пользователей доступны только владельцу."><textarea readOnly rows={2} value={code} onFocus={e=>e.target.select()} spellCheck={false}/></Field><div className="button-row"><button type="button" className="button secondary small" onClick={()=>void copyCode()}>Скопировать код</button><button type="button" className="button ghost small" onClick={()=>setInvitation(null)}>Скрыть код</button></div></>}
      {users.filter(user=>user.active&&!hiddenIds.includes(user.id)).map(userRow)}
      {users.some(user=>!user.active||hiddenIds.includes(user.id))&&<details className="section-fold"><summary>Скрытые и неактивные доступы · {users.filter(user=>!user.active||hiddenIds.includes(user.id)).length}</summary>{users.filter(user=>!user.active||hiddenIds.includes(user.id)).map(userRow)}</details>}
    </>:<p className="muted">Получение профиля…</p>}
  </Panel>;
}

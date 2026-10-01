import { useEffect, useState } from 'react';
import { defaultServerEndpoint } from '../shared/accounts';
import { Field, Modal, errorText } from './ui';

export function ConnectionGate(){
  const [open,setOpen]=useState(false),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{let active=true;void window.nexus.data.remoteConfig().then(config=>{if(active)setOpen(!config.configured);}).catch(()=>{});return()=>{active=false;};},[]);
  async function connect(){
    if(!code.trim()||busy)return;
    setBusy(true);setError('');
    try{await window.nexus.data.configureRemote({endpoint:defaultServerEndpoint,token:code.trim(),passphrase:''});window.location.reload();}
    catch(cause){setError(errorText(cause));setBusy(false);}
  }
  if(!open)return null;
  return <Modal title="Вход в NEXUS" onClose={()=>{if(!busy)setOpen(false);}}>
    <form className="form-stack" onSubmit={event=>{event.preventDefault();void connect();}}>
      <Field label="Код доступа"><input autoFocus type="password" autoComplete="off" value={code} onChange={event=>setCode(event.target.value)} disabled={busy}/></Field>
      {error&&<p className="error" role="alert">{error}</p>}
      <div className="form-actions"><button className="button primary" disabled={busy||!code.trim()}>{busy?'Подключение…':'Войти'}</button></div>
    </form>
  </Modal>;
}

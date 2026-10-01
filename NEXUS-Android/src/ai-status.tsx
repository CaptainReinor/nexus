import { useEffect, useState } from 'react';
import { aiStatus,remoteProfile } from './sync';

export function AIStatus(){
  const [error,setError]=useState('');
  const [role,setRole]=useState<'owner'|'guest'|null>(null);
  const [status,setStatus]=useState<'loading'|'ready'|'missing'|'error'>('loading');
  async function check(){setStatus('loading');try{setRole((await remoteProfile()).role);setStatus(await aiStatus()?'ready':'missing');}catch(e){setError(e instanceof Error?e.message:'Не удалось проверить OpenRouter.');setStatus('error');}}
  useEffect(()=>{void check();},[]);
  return <section className="card"><h2>AI на телефоне</h2><p>{status==='ready'?'Ключ OpenRouter подключён. AI-запросы отправляются с телефона, данные синхронизируются через сервер.':status==='loading'?'Проверяем подключение…':status==='missing'?'Ключ OpenRouter ещё не выдан для этого профиля.':error||'Не удалось подключиться к OpenRouter.'}</p>{status!=='ready'&&<p className="muted">{role==='guest'?'Проверьте VPN на телефоне. Если ключ ещё не выдан, обратитесь к владельцу NEXUS.':'Проверьте VPN. Для своего телефона: NEXUS на ПК → Настройки → Сервер и синхронизация → «Подключить AI на телефоне».'}</p>}<button className="ghost" onClick={()=>void check()}>Проверить снова</button></section>;
}

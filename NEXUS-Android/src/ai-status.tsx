import { useEffect, useState } from 'react';
import { aiStatus,remoteProfile } from './sync';

export function AIStatus(){
  const [error,setError]=useState('');
  const [role,setRole]=useState<'owner'|'guest'|null>(null);
  const [status,setStatus]=useState<'loading'|'ready'|'missing'|'error'>('loading');
  async function check(){setStatus('loading');try{setRole((await remoteProfile()).role);setStatus(await aiStatus()?'ready':'missing');}catch(e){setError(e instanceof Error?e.message:'Не удалось проверить OpenRouter.');setStatus('error');}}
  useEffect(()=>{void check();},[]);
  return <section className="card dominion-frame"><h2>OpenRouter</h2><p>{status==='ready'?'Подключено.':status==='loading'?'Проверка…':status==='missing'?'Ключ ещё не выдан.':error||'Не удалось подключиться к OpenRouter.'}</p>{status!=='ready'&&<p className="muted">{role==='guest'?'Проверьте VPN. Нет ключа — обратитесь к владельцу.':'Проверьте VPN. Для своего телефона: NEXUS на ПК → Настройки → Сервер и синхронизация → «Подключить OpenRouter».'}</p>}<button className="ghost" onClick={()=>void check()}>Проверить снова</button></section>;
}

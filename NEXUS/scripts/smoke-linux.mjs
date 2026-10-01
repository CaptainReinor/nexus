import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';

const directory=await mkdtemp(join(tmpdir(),'nexus-linux-smoke-'));
const executable=resolve(process.argv[2]||'release/squashfs-root/AppRun');
const child=spawn(executable,['--remote-debugging-address=127.0.0.1','--remote-debugging-port=19347'],{
  env:{...process.env,NEXUS_TEST_USER_DATA:directory,XDG_CONFIG_HOME:join(directory,'config')},stdio:['ignore','pipe','pipe']
});
let log='',socket;
child.stdout.on('data',data=>{log+=data;});child.stderr.on('data',data=>{log+=data;});
const deadline=setTimeout(()=>{child.kill();},55000);
try{
  let target;
  for(let attempt=0;attempt<90;attempt++){
    if(child.exitCode!==null)throw new Error('Linux process stopped: '+log);
    try{target=(await (await fetch('http://127.0.0.1:19347/json/list')).json()).find(item=>item.type==='page'&&item.url.startsWith('file:'));}catch{/* wait for the app */}
    if(target)break;await delay(500);
  }
  assert.ok(target,'Packaged Linux window did not load: '+log);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.addEventListener('open',ok,{once:true});socket.addEventListener('error',fail,{once:true});});
  const result=await new Promise((ok,fail)=>{
    socket.addEventListener('close',()=>fail(new Error('Packaged application closed during smoke test: '+log)),{once:true});
    socket.addEventListener('message',event=>{const message=JSON.parse(event.data);if(message.id===1){if(message.error||message.result.exceptionDetails)fail(new Error(JSON.stringify(message)));else ok(message.result.result.value);}});
    socket.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{awaitPromise:true,returnByValue:true,expression:`(async()=>{
      for(let attempt=0;attempt<40&&!window.nexus;attempt++)await new Promise(ok=>setTimeout(ok,100));
      const settings=await window.nexus.settings.get();
      await window.nexus.health.saveDayField({day:'2026-01-02',field:'weight',value:81.5});
      const health=await window.nexus.health.list();
      const profiles=await window.nexus.profiles.list();
      const remote=await window.nexus.data.remoteConfig();
      return {autostart:settings.autostart,weight:health.weights.find(row=>row.day==='2026-01-02')?.weight_kg,profiles:profiles.profiles.length,configured:remote.configured,text:document.body.innerText};
    })()`}}));
  });
  assert.equal(result.weight,81.5);assert.equal(result.profiles,1);assert.equal(result.configured,false);assert.equal(result.autostart,false);
  assert.ok(result.text.includes('Сегодня'),'Renderer did not display the dashboard');
  console.log('Linux packaged smoke passed: sandboxed window, preload IPC, settings, SQLite write/read, profiles, dashboard. No AI or sync requests.');
}finally{
  clearTimeout(deadline);socket?.close();child.kill();
  if(child.exitCode===null)await Promise.race([new Promise(ok=>child.once('exit',ok)),delay(5000)]);
  await rm(directory,{recursive:true,force:true});
}

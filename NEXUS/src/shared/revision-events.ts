type Options={endpoint:string;token:string;revision:(revision:number)=>void;fallback:()=>void;error?:()=>void};
const pause=(ms:number,signal:AbortSignal)=>new Promise<void>(resolve=>{if(signal.aborted){resolve();return;}const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};const timer=setTimeout(done,ms);signal.addEventListener('abort',done,{once:true});});

/** Authenticated SSE; heartbeat bytes carry no snapshot and do not repaint the UI. */
export async function watchRevisions(options:Options,signal:AbortSignal,request:typeof fetch=fetch):Promise<void>{
  let retry=1000;
  while(!signal.aborted){
    const controller=new AbortController();const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});
    let watchdog:ReturnType<typeof setTimeout>|undefined;
    const alive=()=>{if(watchdog)clearTimeout(watchdog);watchdog=setTimeout(abort,45_000);};
    try{
      alive();
      const response=await request(`${options.endpoint}/v1/events`,{headers:{Authorization:`Bearer ${options.token}`,Accept:'text/event-stream'},redirect:'error',signal:controller.signal});
      if(response.status===404||response.status===405){options.fallback();await pause(60_000,signal);continue;}
      if(!response.ok||!response.headers.get('content-type')?.includes('text/event-stream'))throw new Error('Event stream unavailable');
      const reader=response.body?.getReader();if(!reader)throw new Error('Missing stream');
      const decoder=new TextDecoder();let buffer='';retry=1000;
      try{
        while(!signal.aborted){
          const {done,value}=await reader.read();if(done)break;alive();
          buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');
          if(buffer.length>16_384)throw new Error('Invalid event size');
          let end:number;
          while((end=buffer.indexOf('\n\n'))>=0){
            const block=buffer.slice(0,end);buffer=buffer.slice(end+2);
            const data=block.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trim()).join('\n');
            if(!data)continue;
            const event=JSON.parse(data) as {revision:unknown};
            if(typeof event.revision==='number'&&Number.isSafeInteger(event.revision)&&event.revision>=0)options.revision(event.revision);
          }
        }
      }finally{await reader.cancel().catch(()=>{});}
    }catch{if(!signal.aborted)options.error?.();}
    finally{if(watchdog)clearTimeout(watchdog);controller.abort();signal.removeEventListener('abort',abort);}
    if(!signal.aborted){await pause(retry,signal);retry=Math.min(30_000,retry*2);}
  }
}

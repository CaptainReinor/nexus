import { net } from 'electron';

/** Use Chromium's system proxy/PAC and certificate handling, as the browser does. */
export const desktopFetch:typeof fetch=async(input,options)=>{
  try{return await net.fetch(input instanceof URL?input.href:input,options);}
  catch(error){
    const address=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    if(new URL(address).hostname==='openrouter.ai')throw new Error('Не удалось соединиться с OpenRouter. Проверьте VPN и доступ к сервису.',{cause:error});
    throw error;
  }
};

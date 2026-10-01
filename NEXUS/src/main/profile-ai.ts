import type { AIProvider } from './ai';
import { OpenRouterProvider, OpenRouterAuthenticationError } from './ai';
import type { RemoteBackupService } from './remote-backup';

/** Each device talks to OpenRouter with its own profile's limited key. */
export class ProfileAIProvider implements AIProvider {
  constructor(private remote:RemoteBackupService,private direct:AIProvider=new OpenRouterProvider()){}
  private async useKey<T>(key:string,run:(resolved:string)=>Promise<T>):Promise<T>{
    const manualKey=this.remote.isGuest()?'':key;
    const resolved=manualKey||await this.remote.deviceAIKey();
    try{return await run(resolved);}catch(error){
      if(!manualKey&&error instanceof OpenRouterAuthenticationError)this.remote.clearDeviceAIKey();
      throw error;
    }
  }
  async test(key:string){return this.useKey(key,resolved=>this.direct.test(resolved));}
  async complete(key:string,model:string,system:string,user:string,structured:boolean,responseFormat?:Record<string,unknown>){
    return this.useKey(key,resolved=>this.direct.complete(resolved,model,system,user,structured,responseFormat));
  }
  async transcribe(key:string,model:string,base64:string,format:string){
    return this.useKey(key,resolved=>this.direct.transcribe(resolved,model,base64,format));
  }
}

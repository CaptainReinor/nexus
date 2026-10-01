import type { AIProvider } from './ai';
import { OpenRouterProvider } from './ai';
import type { RemoteBackupService } from './remote-backup';

/** Each device talks to OpenRouter with its own profile's limited key. */
export class ProfileAIProvider implements AIProvider {
  private direct=new OpenRouterProvider();
  constructor(private remote:RemoteBackupService){}
  async test(key:string){return this.direct.test(key||await this.remote.deviceAIKey());}
  async complete(key:string,model:string,system:string,user:string,structured:boolean,responseFormat?:Record<string,unknown>){
    return this.direct.complete(key||await this.remote.deviceAIKey(),model,system,user,structured,responseFormat);
  }
  async transcribe(key:string,model:string,base64:string,format:string){
    return this.direct.transcribe(key||await this.remote.deviceAIKey(),model,base64,format);
  }
}

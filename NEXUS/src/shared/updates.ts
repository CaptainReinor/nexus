export type UpdateState={phase:'idle'|'checking'|'current'|'available'|'downloading'|'ready'|'error'|'unsupported';currentVersion:string;version?:string;percent?:number;message?:string};
export interface UpdateAPI {
  status():Promise<UpdateState>;
  check():Promise<UpdateState>;
  download():Promise<UpdateState>;
  install():Promise<void>;
}

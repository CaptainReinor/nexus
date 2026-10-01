import { randomUUID } from 'node:crypto';
import { existsSync,mkdirSync,readFileSync,renameSync,writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

const identity=z.union([z.literal('local'),z.string().uuid()]);
const registrySchema=z.object({active:identity,profiles:z.array(z.object({id:identity,name:z.string().trim().min(1).max(80)})).min(1).max(20)}).strict();
export class ProfileManager {
  private path:string;
  constructor(private root:string){this.path=join(root,'profiles.json');}
  private read():z.infer<typeof registrySchema>{
    if(!existsSync(this.path))return {active:'local',profiles:[{id:'local',name:'Личный'}]};
    const state=registrySchema.parse(JSON.parse(readFileSync(this.path,'utf8')));
    if(!state.profiles.some(profile=>profile.id===state.active)||new Set(state.profiles.map(p=>p.id)).size!==state.profiles.length)throw new Error('Список профилей повреждён.');
    return state;
  }
  private write(state:z.infer<typeof registrySchema>){
    mkdirSync(this.root,{recursive:true});
    writeFileSync(`${this.path}.tmp`,JSON.stringify(state),{mode:0o600});renameSync(`${this.path}.tmp`,this.path);
  }
  list(){return this.read();}
  directory(){const state=this.read();return state.active==='local'?this.root:join(this.root,'profiles',state.active);}
  create(name:string){
    name=z.string().trim().min(1).max(80).parse(name);
    const state=this.read();if(state.profiles.length>=20)throw new Error('Можно создать до 20 профилей.');
    if(state.profiles.some(profile=>profile.name.toLocaleLowerCase('ru-RU')===name.toLocaleLowerCase('ru-RU')))throw new Error('Такой профиль уже существует.');
    const profile={id:randomUUID(),name};
    mkdirSync(join(this.root,'profiles',profile.id),{recursive:true});
    state.profiles.push(profile);this.write(state);return profile;
  }
  select(id:string){const state=this.read();if(!state.profiles.some(p=>p.id===id))throw new Error('Профиль не найден.');state.active=id;this.write(state);}
}

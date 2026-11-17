import {z} from './validation';
import {dateSchema} from './growth';

export const socialKinds=['weight','sleep','food','journal','training','care'] as const;
export const socialKindNames:Record<typeof socialKinds[number],string>={weight:'Вес',sleep:'Сон',food:'Питание',journal:'Запись дня',training:'Тренировка',care:'Уход'};
export const socialPlanSchema=z.partialRecord(z.enum(socialKinds),z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(v=>new Set(v).size===v.length)).refine(x=>Object.keys(x).length>0,'Выберите хотя бы один пункт.');
const id=z.string().uuid(),name=z.string().trim().min(1).max(60);
const privacy=z.object({shareWeightChange:z.boolean(),shareWeight:z.boolean(),shareTraining:z.boolean()}).strict();
export const socialPreferencesSchema=privacy.partial().extend({nickname:z.string().trim().min(1).max(40).optional(),plan:socialPlanSchema.optional()}).strict();
export const socialMutationSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('create'),name,nickname:z.string().trim().min(1).max(40),timezone:z.string().min(1).max(80)}).strict(),
 z.object({action:z.literal('join'),code:z.string().trim().min(8).max(100),nickname:z.string().trim().min(1).max(40)}).strict(),
 z.object({action:z.literal('leave'),groupId:id}).strict(),
 z.object({action:z.literal('invite'),groupId:id}).strict(),
 z.object({action:z.literal('preferences'),groupId:id,preferences:socialPreferencesSchema}).strict(),
 z.object({action:z.literal('challenge'),groupId:id,name:z.string().trim().min(1).max(100),kind:z.enum(['training','consistency','weight_checkins']),target:z.number().int().min(1).max(1000),endDay:dateSchema}).strict(),
 z.object({action:z.literal('participate'),challengeId:id,join:z.boolean()}).strict()
 ,z.object({action:z.literal('cheer'),groupId:id,userId:z.union([z.literal('owner'),id])}).strict()
]);
export type SocialMutation=z.infer<typeof socialMutationSchema>;
const member=z.object({id:z.union([z.literal('owner'),id]),nickname:z.string(),self:z.boolean(),rank:z.number().int().positive(),points:z.number().int().nonnegative(),completed:z.number().int().nonnegative(),planned:z.number().int().nonnegative(),cheers:z.number().int().nonnegative().default(0),cheeredByMe:z.boolean().default(false),joinedDay:dateSchema,trainingDays:z.number().int().nonnegative().optional(),weightKg:z.number().positive().optional(),weightChangeKg:z.number().optional(),weightPeriod:z.object({start:dateSchema,end:dateSchema}).optional(),privacy:privacy.optional(),plan:socialPlanSchema.optional(),planEffectiveDay:dateSchema.optional(),days:z.array(z.object({day:dateSchema,points:z.number().int().min(0).max(100),done:z.number().int().nonnegative(),planned:z.number().int().nonnegative()})).optional()}).strict();
const challenge=z.object({id,name:z.string(),kind:z.enum(['training','consistency','weight_checkins']),target:z.number().int().positive(),startDay:dateSchema,endDay:dateSchema,joined:z.boolean(),contributions:z.array(z.object({userId:z.union([z.literal('owner'),id]),value:z.number().int().nonnegative()})),total:z.number().int().nonnegative()}).strict();
const group=z.object({id,name:z.string(),timezone:z.string(),ownerId:z.union([z.literal('owner'),id]),weekStart:dateSchema,weekEnd:dateSchema,inviteCode:z.string().optional(),members:z.array(member).max(20),challenges:z.array(challenge).max(24)}).strict();
export const socialStateSchema=z.object({userId:z.union([z.literal('owner'),id]),revision:z.number().int().nonnegative(),groups:z.array(group).max(5)}).strict();
export type SocialState=z.infer<typeof socialStateSchema>;
export type SocialGroup=SocialState['groups'][number];
export type SocialPlan=z.infer<typeof socialPlanSchema>;
export interface SocialAPI{state():Promise<SocialState>;change(input:SocialMutation):Promise<SocialState>;watch(notify:()=>void):()=>void;}
export function socialRoute(input:SocialMutation):{path:string;method:'POST'|'PUT';body:Record<string,unknown>}{
 const x=socialMutationSchema.parse(input);
 switch(x.action){
  case 'create':return {path:'/v1/social/groups',method:'POST',body:{name:x.name,nickname:x.nickname,timezone:x.timezone}};
  case 'join':return {path:'/v1/social/join',method:'POST',body:{code:x.code,nickname:x.nickname}};
  case 'preferences':return {path:`/v1/social/groups/${x.groupId}/preferences`,method:'PUT',body:x.preferences};
  case 'leave':case 'invite':return {path:`/v1/social/groups/${x.groupId}/${x.action}`,method:'POST',body:{}};
  case 'cheer':return {path:`/v1/social/groups/${x.groupId}/cheer`,method:'POST',body:{userId:x.userId}};
  case 'challenge':return {path:`/v1/social/groups/${x.groupId}/challenges`,method:'POST',body:{name:x.name,kind:x.kind,target:x.target,endDay:x.endDay}};
  case 'participate':return {path:`/v1/social/challenges/${x.challengeId}/${x.join?'join':'leave'}`,method:'POST',body:{}};
 }
}
export function socialError(code:string){return ({group_not_found:'Группа недоступна.',invite_not_found:'Код группы не найден.',social_rate_limit:'Слишком много попыток. Подождите минуту.',group_limit:'Можно участвовать в пяти группах.',member_limit:'В группе уже 20 участников.',group_owner_required:'Это действие доступно создателю группы.',invalid_plan:'Проверьте расписание плана.',challenge_finished:'Челлендж уже завершён.',invalid_challenge:'Проверьте цель и дату челленджа.',challenge_limit:'В группе уже восемь активных челленджей.',invalid_social_input:'Проверьте введённые данные.',invalid_timezone:'Не удалось определить часовой пояс.'} as Record<string,string>)[code]??'Не удалось обновить группу. Повторите позже.';}

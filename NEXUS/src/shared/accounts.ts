import { z } from './validation';
export const defaultServerEndpoint='https://v3233631.hosted-by-vdsina.ru/nexus-api';
export const remoteProfileSchema=z.object({id:z.union([z.literal('owner'),z.string().uuid()]),name:z.string(),role:z.enum(['owner','guest']),active:z.boolean(),monthlyLimitCents:z.number().int().nonnegative().optional(),usedMicrousd:z.number().int().nonnegative().optional(),models:z.record(z.string(),z.string()).optional(),aiMode:z.enum(['device','unconfigured']).optional(),aiKeyHash:z.string().regex(/^[a-f0-9]{64}$/).optional()});
export type RemoteProfile=z.infer<typeof remoteProfileSchema>;
export type LocalProfiles={active:string;profiles:{id:string;name:string}[]};
export const invitationCodeSchema=z.string().regex(/^NEXUS-(?:[A-Z2-7]{4}-){5}[A-Z2-7]{4}$/);
export function normalizeInvitationToken(value:string):string{
  const token=value.trim();
  if(!/^nexus-/i.test(token))return token;
  const code=token.replace(/\s/g,'').toUpperCase();
  if(!invitationCodeSchema.safeParse(code).success)throw new Error('Код приглашения повреждён. Скопируйте его целиком.');
  return code;
}
export type UserInvitation={user:RemoteProfile;token?:string;code?:string;endpoint:string};

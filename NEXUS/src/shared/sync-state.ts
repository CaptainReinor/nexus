import { z } from './validation';

export const supportedSyncVersions=[4,5,6,7,8] as const;
export const syncStateSchema=z.object({
  revision:z.number().int().nonnegative().safe(),
  snapshot:z.object({format:z.literal('nexus-backup'),version:z.number().int().refine(version=>supportedSyncVersions.some(v=>v===version),'Обновите приложение: версия данных изменилась.'),exportedAt:z.string(),tables:z.record(z.string(),z.array(z.record(z.string(),z.unknown())))}).nullable()
});

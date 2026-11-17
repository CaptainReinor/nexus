import {z} from './validation';

export const quickKinds=['text','voice','weight','expense'] as const;
export const quickKindSchema=z.enum(quickKinds);
export const quickShortcutSchema=z.enum(['CommandOrControl+Shift+Space','CommandOrControl+Alt+N','']);
export type QuickKind=z.infer<typeof quickKindSchema>;
export type QuickStatus={shortcut:z.infer<typeof quickShortcutSchema>;available:boolean};
export interface DesktopQuickAPI{
  status():Promise<QuickStatus>;
  shortcut(value:QuickStatus['shortcut']):Promise<QuickStatus>;
  open(kind:QuickKind):Promise<void>;
  consume():Promise<string|null>;
  watch(fn:(kind:string)=>void):()=>void;
}

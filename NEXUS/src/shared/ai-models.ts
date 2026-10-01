export const economicalAIModels = {
  cheapModel:'google/gemini-2.5-flash-lite',
  standardModel:'deepseek/deepseek-v3.2',
  advancedModel:'deepseek/deepseek-v3.2',
  transcriptionModel:'openai/whisper-1',
} as const;
export type AIModelMode='preset'|'custom';
export type AIModels={ [K in keyof typeof economicalAIModels]:string };
export function resolveAIModels(mode:unknown,stored:Partial<AIModels>,guest=false):AIModels {
  return Object.fromEntries(Object.entries(economicalAIModels).map(([key,fallback])=>[
    key,mode==='custom'&&!guest?(stored[key as keyof AIModels]?.trim()||fallback):fallback,
  ])) as AIModels;
}

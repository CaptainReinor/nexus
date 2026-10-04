vi.mock('./desktop-fetch',()=>({desktopFetch:(...args:Parameters<typeof fetch>)=>fetch(...args)}));
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIGateway, analysisSchema, journalAnalysisSchema, vacancyDraftSchema, OpenRouterProvider, OpenRouterAuthenticationError, type AIProvider } from './ai';
import { openDatabase } from './database';
import type { SettingsRepository } from './settings';
import type { WorkRepository } from './work';
import { wellbeingInstructions } from '../shared/wellbeing';
import {DayLifeRepository} from './life';

afterEach(()=>vi.unstubAllGlobals());

it('passes saved expense comments and diary text from the repository to the mentor provider',async()=>{
  const db=openDatabase(':memory:');
  const complete=vi.fn<AIProvider['complete']>().mockResolvedValue({content:JSON.stringify({headline:'Тест',wins:[],problems:[],actions:[],closing:'Тест'}),requestId:'synthetic-review',inputTokens:1,outputTokens:1,costMicrousd:0});
  const settings={get:()=>({aiEnabled:true,aiBudgetCents:1000,standardModel:'test/model'}),usedMicrousd:()=>({known:0,unknown:0}),getApiKey:()=> 'synthetic-key'} as unknown as SettingsRepository;
  try{
    db.prepare("INSERT OR IGNORE INTO finance_accounts(id,name) VALUES (1,'Дебет')").run();
    db.prepare("INSERT OR IGNORE INTO finance_categories(id,name,kind) VALUES (1,'Еда','expense')").run();
    db.prepare("INSERT INTO finance_transactions(occurred_at,type,amount_cents,account_id,category_id,note) VALUES ('2026-10-06T12:00:00','expense',70000,1,1,'Обед с другом')").run();
    db.prepare("INSERT INTO daily_journals(day,raw_text,source,created_at) VALUES ('2026-10-06','Погулял после работы','text','2026-10-06T12:00:00')").run();
    const ai=new AIGateway(db,settings,{} as WorkRepository,{complete} as unknown as AIProvider);
    await ai.reviewLife(new DayLifeRepository(db).facts('2026-10-06','2026-10-06'));
    const sent=JSON.parse(complete.mock.calls[0][3]);
    expect(sent.finance[0]).toMatchObject({note:'Обед с другом',amount_cents:70000,account_name:'Дебет'});
    expect(sent.journals[0].raw_text).toBe('Погулял после работы');
    expect(complete.mock.calls[0][2]).toContain('Обязательно учитывай пояснения в комментариях');
    expect(complete).toHaveBeenCalledOnce();
  }finally{db.close();}
});

it('distinguishes a network rejection from an invalid key during connection checks',async()=>{
  const provider=new OpenRouterProvider();
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:403})));
  await expect(provider.test('synthetic')).rejects.toThrow('запретил запрос из этой сети');
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:401})));
  await expect(provider.test('synthetic')).rejects.toBeInstanceOf(OpenRouterAuthenticationError);
});

describe('structured AI output',()=>{
  it('uses the default account when daily text omits an account and accepts a single wake time',async()=>{
    const db=openDatabase(':memory:');
    const complete=vi.fn<AIProvider['complete']>().mockResolvedValue({content:JSON.stringify({summary:'Расход и сон',health:{weightKg:null,sleepStart:null,sleepEnd:'08:00',mood:null,energy:null,nutrition:null,workout:null,habits:[]},finance:[{type:'expense',amountCents:500000,categoryId:3,accountId:null,note:'Еда'}],work:[],uncertain:[]}),requestId:'test',inputTokens:1,outputTokens:1,costMicrousd:1});
    const settings={get:()=>({aiEnabled:true,aiBudgetCents:1000,cheapModel:'test/model',standardModel:''}),usedMicrousd:()=>({known:0,unknown:0}),getApiKey:()=> 'test'} as unknown as SettingsRepository;
    try{
      const ai=new AIGateway(db,settings,{} as WorkRepository,{complete} as unknown as AIProvider);
      const result=await ai.analyzeJournal('Встал в 8 утра. Потратил 5 тысяч на еду.',{habits:[],accounts:[{id:2,name:'Карта'}],defaultAccountId:2,categories:[{id:3,name:'Еда',kind:'expense'}],jobs:[]});
      expect(result.health.sleepEnd).toBe('08:00');
      expect(result.finance[0]).toMatchObject({amountCents:500000,accountId:2,categoryId:3});
      const prompt=complete.mock.calls[0][2];
      expect(prompt).toContain('Не требуй упоминания счёта');
      expect(prompt).toContain('определяй независимо');
      expect(prompt).toContain(wellbeingInstructions);
      expect(complete.mock.calls[0][5]).toMatchObject({type:'json_schema',json_schema:{name:'nexus_day',strict:true}});
    }finally{db.close();}
  });
  it('rejects missing analysis fields',()=>expect(analysisSchema.safeParse({requirements:['SQL']}).success).toBe(false));
  it('rejects invalid daily finance amounts and mood',()=>expect(journalAnalysisSchema.safeParse({summary:'',health:{weightKg:null,sleepStart:null,sleepEnd:null,mood:12,energy:null,nutrition:null,workout:null,habits:[]},finance:[{type:'expense',amountCents:-1,categoryId:null,accountId:null,note:''}],work:[],uncertain:[]}).success).toBe(false));
  it('validates extracted vacancy fields and does not accept invented extra fields',()=>{
    const draft={title:'Аналитик',company:'Компания',url:null,source:null,city:'Москва',work_mode:'Удалённо',salary_from:120000,salary_to:180000,currency:'RUB'};
    expect(vacancyDraftSchema.safeParse(draft).success).toBe(true);
    expect(vacancyDraftSchema.safeParse({...draft,salary_from:-1}).success).toBe(false);
    expect(vacancyDraftSchema.safeParse({...draft,unrequested:'text'}).success).toBe(false);
  });
  it('sends recorded audio to the transcription endpoint and reads reported cost',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({text:'Сходил на тренировку.',usage:{cost:0.0012,input_tokens:12,output_tokens:5}}),{status:200}));
    vi.stubGlobal('fetch',fetchMock);
    const result=await new OpenRouterProvider().transcribe('test-key','openai/whisper-1','YXVkaW8=','webm');
    expect(result.content).toBe('Сходил на тренировку.');expect(result.costMicrousd).toBe(1200);
    const [url,options]=fetchMock.mock.calls[0];expect(url).toBe('https://openrouter.ai/api/v1/audio/transcriptions');
    expect(JSON.parse(options.body)).toMatchObject({model:'openai/whisper-1',input_audio:{data:'YXVkaW8=',format:'webm'},language:'ru'});
  });
  it('reports provider rejection separately from connection errors and hides keys',async()=>{
    const key='sk-or-v1-'+ 'x'.repeat(64);
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:'Unsupported model '+key}}),{status:400})));
    await expect(new OpenRouterProvider().complete(key,'test/model','JSON','example',true)).rejects.toThrow('параметры модели');
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:'Unsupported model '+key}}),{status:400})));
    try{await new OpenRouterProvider().complete(key,'test/model','JSON','example',true);}catch(error){expect(String(error)).not.toContain(key);expect(String(error)).toContain('[скрыто]');}
  });
  it('does not reveal the key budget from a provider quota error',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:'Key budget $0.50 exceeded'}}),{status:402})));
    try{await new OpenRouterProvider().complete('test-key','test/model','JSON','example',true);throw new Error('Expected rejection');}
    catch(error){expect(String(error)).toContain('лимит');expect(String(error)).not.toContain('0.50');expect(String(error)).not.toContain('Key budget');}
  });
  it.each([['openai/gpt-6-luna','low'],['openai/gpt-6-sol','medium'],['openai/gpt-6-astra','medium']])('uses compatible reasoning parameters for %s',async(model,effort)=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{}'}}]}),{status:200}));
    vi.stubGlobal('fetch',fetchMock);
    await new OpenRouterProvider().complete('test-key',model,'Return JSON','example',true);
    const body=JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({model,max_completion_tokens:6000,reasoning_effort:effort,response_format:{type:'json_object'}});
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('max_tokens');
  });
  it.each(['google/gemini-3.5-flash-lite','anthropic/claude-opus-5'])('allows a complete response from %s',async model=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{}'}}]}),{status:200}));
    vi.stubGlobal('fetch',fetchMock);
    await new OpenRouterProvider().complete('test-key',model,'Return JSON','example',true);
    const body=JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({model,max_tokens:6000,temperature:0.2,response_format:{type:'json_object'}});
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(body).not.toHaveProperty('reasoning_effort');
  });
});

it('sends care slots to the model and drops invented identities without marking the other execution',async()=>{
 const db=openDatabase(':memory:'),slot='30000000-0000-4000-8000-000000000003';
 const complete=vi.fn<AIProvider['complete']>().mockResolvedValue({content:JSON.stringify({summary:'Утренний уход',health:{weightKg:null,sleepStart:null,sleepEnd:null,mood:null,energy:null,nutrition:null,workout:null,habits:[{habitId:99,value:1,status:'done',reason:'Всё сразу'}]},finance:[],work:[],uncertain:[],life:{care:[{slotId:slot,done:true},{slotId:'40000000-0000-4000-8000-000000000004',done:true}]}}),requestId:'mock',inputTokens:1,outputTokens:1,costMicrousd:0});
 const settings={get:()=>({aiEnabled:true,aiBudgetCents:1000,cheapModel:'test/model'}),usedMicrousd:()=>({known:0,unknown:0}),getApiKey:()=> 'synthetic'} as unknown as SettingsRepository;
 try{const ai=new AIGateway(db,settings,{} as WorkRepository,{complete} as unknown as AIProvider),care=[{id:slot,habitId:99,name:'Уход',label:'Утро',time:'08:00'}];const result=await ai.analyzeJournal('Утром сделал уход',{day:'2026-10-03',care,habits:[],accounts:[],defaultAccountId:null,categories:[],jobs:[]});expect(result.life?.care).toEqual([{slotId:slot,done:true}]);expect(result.health.habits).toEqual([]);expect(complete.mock.calls[0][2]).toContain('Никогда не засчитывай все слоты');expect(JSON.parse(complete.mock.calls[0][3]).known.care).toEqual(care);}finally{db.close();}
});

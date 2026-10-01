import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { NexusAPI } from '../../shared/models';
import { JournalPanel } from './journal';

afterEach(()=>cleanup());

it('autosaves edits to an existing unanalysed journal entry',async()=>{
  const entry={id:3,day:'2026-09-27',raw_text:'Старый текст',source:'text' as const,analysis_json:null,applied_json:'[]',created_at:'2026-09-27T12:00:00'};
  const update=vi.fn().mockImplementation(async input=>({...entry,raw_text:input.text}));
  window.nexus={
    journal:{list:vi.fn().mockResolvedValue([entry]),update,save:vi.fn()},
    settings:{get:vi.fn().mockResolvedValue({currency:'RUB',aiEnabled:false,hasApiKey:false})},
    health:{list:vi.fn().mockResolvedValue({habits:[]})},
    finance:{list:vi.fn().mockResolvedValue({accounts:[],categories:[]})},
    work:{list:vi.fn().mockResolvedValue({jobs:[]})}
  } as unknown as NexusAPI;
  render(<JournalPanel onApplied={()=>{}}/>);
  fireEvent.click(await screen.findByRole('button',{name:/Старый текст/}));
  await waitFor(()=>expect((screen.getByRole('textbox',{name:'Текст дня'}) as HTMLTextAreaElement).value).toBe('Старый текст'));
  fireEvent.change(screen.getByRole('textbox',{name:'Текст дня'}),{target:{value:'Новый текст'}});
  await waitFor(()=>expect(update).toHaveBeenCalledWith({id:3,day:'2026-09-27',text:'Новый текст',source:'text'}),{timeout:2000});
  expect(screen.queryByRole('button',{name:'Сохранить текст'})).toBeNull();
});

it('shows the AI wellbeing suggestions using the same words as the day form',async()=>{
  const analysis={summary:'День прошёл хорошо, но сил было мало.',health:{weightKg:null,sleepStart:null,sleepEnd:null,mood:7,energy:3,nutrition:null,workout:null,habits:[]},finance:[],work:[],uncertain:[]};
  const entry={id:4,day:'2026-09-30',raw_text:'День прошёл хорошо, но сил было мало.',source:'text' as const,analysis_json:JSON.stringify(analysis),applied_json:'[]',created_at:'2026-09-30T12:00:00'};
  window.nexus={
    journal:{list:vi.fn().mockResolvedValue([entry])},
    settings:{get:vi.fn().mockResolvedValue({currency:'RUB',aiEnabled:true,hasApiKey:true})},
    health:{list:vi.fn().mockResolvedValue({habits:[]})},
    finance:{list:vi.fn().mockResolvedValue({accounts:[],categories:[]})},
    work:{list:vi.fn().mockResolvedValue({jobs:[]})}
  } as unknown as NexusAPI;
  render(<JournalPanel onApplied={()=>{}}/>);
  fireEvent.click(await screen.findByRole('button',{name:/День прошёл хорошо/}));
  expect(await screen.findByLabelText('Настроение: Хорошо')).toBeTruthy();
  expect(screen.getByLabelText('Энергия: Мало сил')).toBeTruthy();
  expect(screen.queryByText('Настроение: 7/10')).toBeNull();
});

it('allows an invited user to reach microphone setup without a locally stored API key',async()=>{
  const profile=vi.fn().mockResolvedValue({id:'00000000-0000-4000-8000-000000000001',role:'guest',active:true,aiMode:'device'});
  window.nexus={
    accounts:{profile},journal:{list:vi.fn().mockResolvedValue([])},
    settings:{get:vi.fn().mockResolvedValue({aiEnabled:true,hasApiKey:false})},
    health:{list:vi.fn().mockResolvedValue({habits:[]})},finance:{list:vi.fn().mockResolvedValue({accounts:[],categories:[]})},work:{list:vi.fn().mockResolvedValue({jobs:[]})}
  } as unknown as NexusAPI;
  render(<JournalPanel onApplied={()=>{}}/>);
  await waitFor(()=>expect(window.nexus.settings.get).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button',{name:'● Начитать'}));
  expect(await screen.findByText('Микрофон недоступен в этой системе.')).toBeTruthy();
  expect(profile).toHaveBeenCalledOnce();
  expect(screen.queryByText(/добавьте ключ OpenRouter/)).toBeNull();
});

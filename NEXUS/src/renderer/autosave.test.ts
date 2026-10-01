import { expect, it } from 'vitest';
import { AutoSaveQueue, type AutoSaveStatus } from './autosave';

it('persists the latest edit after a slower earlier save',async()=>{
  let finishFirst:()=>void=()=>{};
  const first=new Promise<void>(resolve=>{finishFirst=resolve;});
  const writes:string[]=[];
  let status:AutoSaveStatus={state:'saved'};
  const queue=new AutoSaveQueue(next=>{status=next;});
  queue.enqueue('note',async()=>{await first;writes.push('old');});
  queue.enqueue('note',async()=>{writes.push('new');});
  finishFirst();
  expect(await queue.flushAll()).toBe(true);
  expect(writes).toEqual(['old','new']);
  expect(status.state).toBe('saved');
});

it('shows a failed save and lets the user retry it',async()=>{
  let attempts=0;
  let status:AutoSaveStatus={state:'saved'};
  const queue=new AutoSaveQueue(next=>{status=next;});
  queue.enqueue('weight',async()=>{attempts++;if(attempts===1)throw new Error('Temporary failure');});
  expect(await queue.flushAll()).toBe(false);
  expect(status.state).toBe('error');
  queue.retry();
  expect(await queue.flushAll()).toBe(true);
  expect(attempts).toBe(2);
  expect(status.state).toBe('saved');
});

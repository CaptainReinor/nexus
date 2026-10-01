import {expect,it,vi} from 'vitest';
const chromium=vi.hoisted(()=>vi.fn());
vi.mock('electron',()=>({net:{fetch:chromium}}));
import {desktopFetch} from './desktop-fetch';
it('routes desktop HTTP through Chromium with credentials, redirect rules and cancellation intact',async()=>{
  const response=new Response('{}');chromium.mockResolvedValue(response);
  const options={headers:{Authorization:'Bearer synthetic'},redirect:'error' as const,signal:new AbortController().signal};
  expect(await desktopFetch(new URL('https://example.test/path'),options)).toBe(response);
  expect(chromium).toHaveBeenCalledWith('https://example.test/path',options);
});
it('reports provider connection failures without exposing request headers',async()=>{
  chromium.mockRejectedValue(new TypeError('fetch failed'));
  await expect(desktopFetch('https://openrouter.ai/api/v1/key')).rejects.toThrow('Проверьте VPN');
});

import { expect,it } from 'vitest';
import { normalizeInvitationToken } from './accounts';
import { journalResponseFormat,parseJournalResponse } from './journal-schema';

it('accepts a copied short code with lowercase letters or line wrapping',()=>{
  expect(normalizeInvitationToken('  nexus-abcd-efgh-ijkl-\nmnop-qrst-uvwx  ')).toBe('NEXUS-ABCD-EFGH-IJKL-MNOP-QRST-UVWX');
});
it('uses complete typed day output on both platforms and tolerates JSON code fences',()=>{
  const schema=(journalResponseFormat.json_schema as {schema:{required:string[];properties:Record<string,unknown>}}).schema;
  expect(schema.required).toEqual(Object.keys(schema.properties));
  const health={weightKg:null,sleepStart:null,sleepEnd:'08:00',mood:null,energy:null,nutrition:null,workout:null,habits:[]};
  const day={summary:'Встал в 8.',health,finance:[],work:[],uncertain:[]};
  expect(parseJournalResponse('```json\n'+JSON.stringify(day)+'\n```').health.sleepEnd).toBe('08:00');
  expect(()=>parseJournalResponse(JSON.stringify({...day,health:{...health,mood:'Хорошо'}}))).toThrow();
});
it('preserves case-sensitive legacy tokens and rejects incomplete short codes',()=>{
  expect(normalizeInvitationToken('  AbCd_xYz123  ')).toBe('AbCd_xYz123');
  expect(()=>normalizeInvitationToken('NEXUS-ABCD-EFGH')).toThrow('целиком');
});

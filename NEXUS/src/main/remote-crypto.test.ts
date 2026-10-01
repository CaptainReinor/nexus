import { expect, it } from 'vitest';
import { decryptBackup, encryptBackup } from './remote-crypto';

it('round-trips an encrypted backup and rejects the wrong phrase or altered data',()=>{
  const phrase='длинная фраза для восстановления NEXUS';
  const original='{"format":"nexus-backup","tables":{"habits":[{"name":"Чтение"}]}}';
  const envelope=encryptBackup(original,phrase);
  expect(decryptBackup(envelope,phrase)).toBe(original);
  expect(()=>decryptBackup(envelope,'совершенно другая длинная фраза')).toThrow(/Не удалось расшифровать/);
  const tampered={...envelope,ciphertext:Buffer.from('changed').toString('base64')};
  expect(()=>decryptBackup(tampered,phrase)).toThrow(/Не удалось расшифровать/);
});

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { z } from 'zod';

const maxCiphertextLength=28_000_000;
const envelopeSchema=z.object({
  format:z.literal('nexus-encrypted-backup'),
  version:z.literal(1),
  exportedAt:z.string().datetime(),
  salt:z.string().max(64),
  iv:z.string().max(32),
  tag:z.string().max(32),
  ciphertext:z.string().min(1).max(maxCiphertextLength)
}).strict();
export type RemoteEnvelope=z.infer<typeof envelopeSchema>;

function key(passphrase:string,salt:Buffer):Buffer {
  if(passphrase.length<16||passphrase.length>256)throw new Error('Ключевая фраза должна содержать от 16 до 256 символов.');
  return scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
}

export function encryptBackup(plaintext:string,passphrase:string):RemoteEnvelope {
  const salt=randomBytes(16),iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',key(passphrase,salt),iv);
  const encrypted=Buffer.concat([cipher.update(plaintext,'utf8'),cipher.final()]);
  return {format:'nexus-encrypted-backup',version:1,exportedAt:new Date().toISOString(),salt:salt.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:encrypted.toString('base64')};
}

export function decryptBackup(input:unknown,passphrase:string):string {
  const envelope=envelopeSchema.parse(input);
  const salt=Buffer.from(envelope.salt,'base64'),iv=Buffer.from(envelope.iv,'base64'),tag=Buffer.from(envelope.tag,'base64');
  if(salt.length!==16||iv.length!==12||tag.length!==16)throw new Error('Зашифрованная копия повреждена.');
  try {
    const decipher=createDecipheriv('aes-256-gcm',key(passphrase,salt),iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]).toString('utf8');
  } catch {throw new Error('Не удалось расшифровать копию. Проверьте ключевую фразу.');}
}

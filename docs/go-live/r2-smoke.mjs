/**
 * NG-13 — smoke do R2 produtivo. PUT/GET/DELETE nos 2 buckets + GET no public URL.
 * Usa o mesmo @aws-sdk/client-s3 do R2StorageProvider da API.
 *
 *   node docs/go-live/r2-smoke.mjs docs/go-live/.env.prod.local
 *
 * (rodar de apps/api para achar o SDK, ou com o node_modules da raiz no path)
 */
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';

const envPath = process.argv[2];
if (!envPath) {
  console.error('uso: node docs/go-live/r2-smoke.mjs <caminho .env>');
  process.exit(1);
}

const env = Object.fromEntries(
  fs
    .readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')];
    }),
);

const client = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});

const key = `smoke/ng13-${Date.now()}.txt`;
const body = `ng-13 smoke ${new Date().toISOString()}`;
let failed = false;

await client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: 'text/plain' }));
console.log('PUT uploads bucket: ok', key);

const got = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
const roundtrip = (await got.Body.transformToString()) === body;
console.log('GET via S3:', roundtrip ? 'match' : 'MISMATCH');
failed ||= !roundtrip;

const pub = `${env.S3_PUBLIC_URL}/${key}`;
const res = await fetch(pub);
const pubText = (await res.text()).trim();
console.log('GET via public URL:', res.status, res.status === 200 && pubText === body ? 'match' : `(${pubText.slice(0, 40)})`);
failed ||= res.status !== 200 || pubText !== body;

await client.send(
  new PutObjectCommand({ Bucket: env.R2_BACKUP_BUCKET, Key: 'smoke/ping.txt', Body: 'ping', ContentType: 'text/plain' }),
);
console.log('PUT backup bucket:', env.R2_BACKUP_BUCKET, 'ok');

await client.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
await client.send(new DeleteObjectCommand({ Bucket: env.R2_BACKUP_BUCKET, Key: 'smoke/ping.txt' }));
console.log('cleanup: ok');

process.exit(failed ? 1 : 0);

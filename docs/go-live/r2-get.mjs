/**
 * Baixa um objeto do R2 (usa o @aws-sdk de apps/api). Sem awscli.
 *
 *   node docs/go-live/r2-get.mjs <env> <bucket> <key|latest:prefix/> [saida]
 *
 * Ex.: baixar o dump mais novo do Neon:
 *   node docs/go-live/r2-get.mjs docs/go-live/.env.prod.local molho-backups latest:neon/ /tmp/dump.sql.gz
 */
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';

const [envPath, bucket, target, outArg] = process.argv.slice(2);
if (!envPath || !bucket || !target) {
  console.error('uso: node docs/go-live/r2-get.mjs <env> <bucket> <key|latest:prefix/> [saida]');
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
  region: env.S3_REGION || 'auto',
  forcePathStyle: true,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
});

let key = target;
if (target.startsWith('latest:')) {
  const prefix = target.slice('latest:'.length);
  const res = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  const items = (res.Contents ?? []).sort((a, b) => a.Key.localeCompare(b.Key));
  if (!items.length) {
    console.error(`nenhum objeto em s3://${bucket}/${prefix}`);
    process.exit(1);
  }
  key = items[items.length - 1].Key;
}

const out = outArg || key.split('/').pop();
const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
await pipeline(obj.Body, fs.createWriteStream(out));
console.log(`${key} -> ${out} (${fs.statSync(out).size} bytes)`);

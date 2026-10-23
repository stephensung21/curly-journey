import { neon } from '@neondatabase/serverless';
import { createHash, randomBytes } from 'node:crypto';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const token = `cj_${randomBytes(32).toString('base64url')}`;
const hash = createHash('sha256').update(token).digest('hex');
await neon(url).query('insert into api_token (token_hash) values ($1)', [hash]);
console.log(token);
console.log("Store this now, it can't be shown again.");

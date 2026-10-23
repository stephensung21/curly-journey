import { neon } from '@neondatabase/serverless';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const sql = neon(url);
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

await sql.query('create table if not exists _migration (name text primary key)');
const applied = new Set((await sql.query('select name from _migration')).map((r) => r.name));
for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
  if (applied.has(f)) {
    console.log(`skip ${f}`);
    continue;
  }
  // Neon's HTTP driver runs one statement per call, so split on statement boundaries.
  const statements = readFileSync(join(dir, f), 'utf8')
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const s of statements) await sql.query(s);
  await sql.query('insert into _migration (name) values ($1)', [f]);
  console.log(`applied ${f}`);
}

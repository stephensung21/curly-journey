import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { hashToken } from '../src/auth';
import { fakePocketSmith, pgliteDb, seedToken } from './helpers';

describe('token auth', () => {
  it('guards everything but /health', async () => {
    const db = await pgliteDb();
    const token = await seedToken(db);
    const app = createApp({ db, pocketsmith: fakePocketSmith(), now: () => new Date('2026-10-23T00:00:00Z') });
    expect((await app.request('/health')).status).toBe(200);
    expect((await app.request('/accounts')).status).toBe(401);
    expect((await app.request('/accounts', { headers: { Authorization: 'Bearer cj_wrong' } })).status).toBe(401);
    expect((await app.request('/accounts', { headers: { Authorization: `Bearer ${token}` } })).status).not.toBe(401);
  });

  it('hashes with SHA-256 hex', async () => {
    expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

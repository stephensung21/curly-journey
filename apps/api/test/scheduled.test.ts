import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/db', () => ({ neonDb: () => ({}) }));
vi.mock('../src/pocketsmith/client', () => ({ pocketSmithClient: () => ({}) }));
const runSync = vi.fn();
const syncDue = vi.fn();
vi.mock('../src/sync/runSync', () => ({
  runSync: (...a: unknown[]) => runSync(...a),
  syncDue: (...a: unknown[]) => syncDue(...a),
}));

import worker from '../src/index';

const run = async (result: unknown, due = true) => {
  runSync.mockReset();
  runSync.mockResolvedValue(result);
  syncDue.mockResolvedValue(due);
  let p: Promise<unknown> = Promise.resolve();
  worker.scheduled({}, { DATABASE_URL: 'postgres://secret-conn', POCKETSMITH_KEY: 'secret-key' }, { waitUntil: (x) => (p = x) });
  await p;
};

describe('scheduled', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs failed status without secrets', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await run({ status: 'failed', error: 'boom secret-key' });
    expect(err).toHaveBeenCalledWith('sync failed', 'failed');
    expect(JSON.stringify(err.mock.calls)).not.toContain('secret');
  });

  it('skips the sync when none is due', async () => {
    await run({ status: 'ok' }, false);
    expect(runSync).not.toHaveBeenCalled();
  });

  it('is quiet on ok', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await run({ status: 'ok' });
    expect(err).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/db', () => ({ neonDb: () => ({}) }));
vi.mock('../src/pocketsmith/client', () => ({ pocketSmithClient: () => ({}) }));
const runSync = vi.fn();
const syncDue = vi.fn();
vi.mock('../src/sync/runSync', () => ({
  runSync: (...a: unknown[]) => runSync(...a),
  syncDue: (...a: unknown[]) => syncDue(...a),
}));
const runAlerts = vi.fn();
vi.mock('../src/alerts/runAlerts', () => ({ runAlerts: (...a: unknown[]) => runAlerts(...a) }));

import worker from '../src/index';

const env = { DATABASE_URL: 'postgres://secret-conn', POCKETSMITH_KEY: 'secret-key' };

const fire = async (cron: string) => {
  let p: Promise<unknown> = Promise.resolve();
  worker.scheduled({ cron }, env, { waitUntil: (x) => (p = x) });
  await p;
};

const run = async (result: unknown, due = true) => {
  runSync.mockReset();
  runSync.mockResolvedValue(result);
  syncDue.mockResolvedValue(due);
  runAlerts.mockReset();
  await fire('*/15 * * * *');
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

  it("runs the alerts job, not the sync, on the hourly '7 * * * *' cron", async () => {
    runSync.mockReset();
    syncDue.mockReset();
    runAlerts.mockReset();
    runAlerts.mockResolvedValue({ matched: 0, sent: 0 });
    await fire('7 * * * *');
    expect(runAlerts).toHaveBeenCalledTimes(1);
    expect(syncDue).not.toHaveBeenCalled();
    expect(runSync).not.toHaveBeenCalled();
  });

  it("keeps the sync on the '*/15 * * * *' cron without running alerts", async () => {
    await run({ status: 'ok' });
    expect(runSync).toHaveBeenCalledTimes(1);
    expect(runAlerts).not.toHaveBeenCalled();
  });

  it('logs an alerts failure without its message', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    runAlerts.mockReset();
    runAlerts.mockRejectedValue(new Error('boom secret-conn'));
    await fire('7 * * * *');
    expect(err).toHaveBeenCalledWith('alerts failed', 'error');
    expect(JSON.stringify(err.mock.calls)).not.toContain('secret');
  });
});

import type { NotificationType } from '@curly/core';
import type { Db } from './db';

export type Prefs = Record<NotificationType, boolean>;

export interface NotifyRepo {
  devices(): Promise<string[]>;
  addDevice(token: string): Promise<void>;
  removeDevices(tokens: string[]): Promise<void>;
  prefs(): Promise<Prefs>;
  setPrefs(patch: Partial<Prefs>): Promise<void>;
  /** Inserts the keys not yet logged and returns just those: the ones this caller may send. */
  claimKeys(keys: string[]): Promise<Set<string>>;
  releaseKeys(keys: string[]): Promise<void>;
}

export function makeNotifyRepo(db: Db): NotifyRepo {
  return {
    async devices() {
      const rows = await db.query<{ token: string }>('select token from push_device order by created_at, token');
      return rows.map((r) => r.token);
    },

    async addDevice(token) {
      await db.query('insert into push_device (token) values ($1) on conflict do nothing', [token]);
    },

    async removeDevices(tokens) {
      if (tokens.length === 0) return;
      await db.query('delete from push_device where token = any($1::text[])', [tokens]);
    },

    async prefs() {
      const rows = await db.query<{ type: NotificationType; enabled: boolean }>('select type, enabled from notification_pref');
      return Object.fromEntries(rows.map((r) => [r.type, r.enabled])) as Prefs;
    },

    async setPrefs(patch) {
      const entries = Object.entries(patch) as [string, boolean][];
      if (entries.length === 0) return;
      await db.query(
        `update notification_pref p set enabled = v.enabled
           from unnest($1::text[], $2::boolean[]) as v(type, enabled) where p.type = v.type`,
        [entries.map(([t]) => t), entries.map(([, e]) => e)],
      );
    },

    async claimKeys(keys) {
      if (keys.length === 0) return new Set();
      const rows = await db.query<{ key: string }>(
        'insert into notification_log (key) select unnest($1::text[]) on conflict do nothing returning key',
        [keys],
      );
      return new Set(rows.map((r) => r.key));
    },

    async releaseKeys(keys) {
      if (keys.length === 0) return;
      await db.query('delete from notification_log where key = any($1::text[])', [keys]);
    },
  };
}

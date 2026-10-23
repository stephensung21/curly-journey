import type { CalendarEvent } from '@curly/core';
import type { Db } from './db';

type EventRow = {
  id: number;
  name: string;
  emoji: string;
  amount_cents: string | null;
  account_id: number | null;
  start_date: string;
  repeat: CalendarEvent['repeat'];
  lead_days: number;
  on_day_alert: boolean;
};

const COLS =
  'id, name, emoji, amount_cents::text as amount_cents, account_id, start_date::text as start_date, repeat, lead_days, on_day_alert';

const toEvent = (r: EventRow): CalendarEvent => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  amountCents: r.amount_cents === null ? null : Number(r.amount_cents),
  accountId: r.account_id,
  startDate: r.start_date,
  repeat: r.repeat,
  leadDays: r.lead_days,
  onDayAlert: r.on_day_alert,
});

export type OccurrenceStatus = {
  eventId: number;
  date: string;
  status: 'paid' | 'skipped';
  source: 'auto' | 'user';
  transactionId: number | null;
};

type StatusRow = {
  event_id: number;
  due_date: string;
  status: 'paid' | 'skipped';
  source: 'auto' | 'user';
  transaction_id: string | null;
};

type EventFields = Omit<CalendarEvent, 'id'>;

// Patch key to SQL column; fixed names, so safe to splice into the update statement.
const PATCH_COLUMNS: Record<keyof EventFields, string> = {
  name: 'name',
  emoji: 'emoji',
  amountCents: 'amount_cents',
  accountId: 'account_id',
  startDate: 'start_date',
  repeat: 'repeat',
  leadDays: 'lead_days',
  onDayAlert: 'on_day_alert',
};

export interface EventsRepo {
  list(): Promise<CalendarEvent[]>;
  get(id: number): Promise<CalendarEvent | null>;
  create(e: EventFields): Promise<CalendarEvent>;
  /** Only the keys present in the patch change (null clears amountCents/accountId). Null when no such event. */
  update(id: number, patch: Partial<EventFields>): Promise<CalendarEvent | null>;
  remove(id: number): Promise<boolean>;
  accountExists(id: number): Promise<boolean>;
  statuses(from: string, to: string): Promise<OccurrenceStatus[]>;
  /** Null deletes the status. */
  setStatus(eventId: number, date: string, status: 'paid' | 'skipped' | null, source: 'user'): Promise<void>;
  /** One statement; existing statuses (including user ones) are never overwritten. Returns rows inserted. */
  insertAutoPaid(matches: { eventId: number; date: string; transactionId: number }[]): Promise<number>;
  /** Transaction ids linked by any occurrence status with due_date in the range. */
  takenTransactionIds(from: string, to: string): Promise<Set<number>>;
}

export function makeEventsRepo(db: Db): EventsRepo {
  const get = async (id: number) => {
    const rows = await db.query<EventRow>(`select ${COLS} from calendar_event where id = $1`, [id]);
    return rows[0] ? toEvent(rows[0]) : null;
  };

  return {
    async list() {
      return (await db.query<EventRow>(`select ${COLS} from calendar_event order by id`)).map(toEvent);
    },

    get,

    async create(e) {
      const rows = await db.query<EventRow>(
        `insert into calendar_event (name, emoji, amount_cents, account_id, start_date, repeat, lead_days, on_day_alert)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning ${COLS}`,
        [e.name, e.emoji, e.amountCents, e.accountId, e.startDate, e.repeat, e.leadDays, e.onDayAlert],
      );
      return toEvent(rows[0]!);
    },

    async update(id, patch) {
      const keys = (Object.keys(PATCH_COLUMNS) as (keyof EventFields)[]).filter((k) => patch[k] !== undefined);
      if (keys.length === 0) return get(id);
      const sets = keys.map((k, i) => `${PATCH_COLUMNS[k]} = $${i + 2}`).join(', ');
      const rows = await db.query<EventRow>(`update calendar_event set ${sets} where id = $1 returning ${COLS}`, [
        id,
        ...keys.map((k) => patch[k]),
      ]);
      return rows[0] ? toEvent(rows[0]) : null;
    },

    async remove(id) {
      return (await db.query('delete from calendar_event where id = $1 returning id', [id])).length > 0;
    },

    async accountExists(id) {
      return (await db.query('select 1 from account where id = $1', [id])).length > 0;
    },

    async statuses(from, to) {
      const rows = await db.query<StatusRow>(
        `select event_id, due_date::text as due_date, status, source, transaction_id::text as transaction_id
           from event_occurrence where due_date between $1 and $2 order by due_date, event_id`,
        [from, to],
      );
      return rows.map((r) => ({
        eventId: r.event_id,
        date: r.due_date,
        status: r.status,
        source: r.source,
        transactionId: r.transaction_id === null ? null : Number(r.transaction_id),
      }));
    },

    async setStatus(eventId, date, status, source) {
      if (status === null) {
        await db.query('delete from event_occurrence where event_id = $1 and due_date = $2', [eventId, date]);
        return;
      }
      await db.query(
        `insert into event_occurrence (event_id, due_date, status, source, transaction_id) values ($1, $2, $3, $4, null)
         on conflict (event_id, due_date)
         do update set status = excluded.status, source = excluded.source, transaction_id = null, updated_at = now()`,
        [eventId, date, status, source],
      );
    },

    async insertAutoPaid(matches) {
      if (matches.length === 0) return 0;
      const rows = await db.query(
        `insert into event_occurrence (event_id, due_date, status, source, transaction_id)
         select m.event_id, m.due_date, 'paid', 'auto', m.transaction_id
           from unnest($1::int[], $2::date[], $3::bigint[]) as m(event_id, due_date, transaction_id)
         on conflict do nothing returning event_id`,
        [matches.map((m) => m.eventId), matches.map((m) => m.date), matches.map((m) => m.transactionId)],
      );
      return rows.length;
    },

    async takenTransactionIds(from, to) {
      const rows = await db.query<{ transaction_id: string }>(
        `select transaction_id::text as transaction_id from event_occurrence
          where transaction_id is not null and due_date between $1 and $2`,
        [from, to],
      );
      return new Set(rows.map((r) => Number(r.transaction_id)));
    },
  };
}

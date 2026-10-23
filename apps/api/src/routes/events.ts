import { daysBetween, isOccurrence, isPayable, occurrences, type CalendarEvent, type Repeat } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeEventsRepo } from '../db/events';
import { isObject, parseId, readJson } from './http';

const MAX_RANGE_DAYS = 120;
const REPEATS: readonly Repeat[] = ['none', 'weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'];

const validDate = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

type EventFields = Omit<CalendarEvent, 'id'>;

/** Validated fields from a body: every field when `full` (defaults filled in), else only those present. Null when invalid. */
async function parseFields(
  body: Record<string, unknown>,
  full: boolean,
  accountExists: (id: number) => Promise<boolean>,
): Promise<Partial<EventFields> | null> {
  const out: Partial<EventFields> = {};
  const has = (k: string) => body[k] !== undefined;
  if (full && ['name', 'emoji', 'startDate', 'repeat'].some((k) => !has(k))) return null;

  if (has('name')) {
    if (typeof body.name !== 'string') return null;
    const name = body.name.trim();
    if (name.length < 1 || name.length > 60) return null;
    out.name = name;
  }
  if (has('emoji')) {
    if (typeof body.emoji !== 'string') return null;
    const len = [...body.emoji].length;
    if (len < 1 || len > 8) return null;
    out.emoji = body.emoji;
  }
  if (has('amountCents')) {
    const a = body.amountCents;
    if (a !== null && !(typeof a === 'number' && Number.isSafeInteger(a) && a > 0)) return null;
    out.amountCents = a as number | null;
  } else if (full) out.amountCents = null;
  if (has('accountId')) {
    const a = body.accountId;
    if (a !== null && !(typeof a === 'number' && Number.isSafeInteger(a) && (await accountExists(a)))) return null;
    out.accountId = a as number | null;
  } else if (full) out.accountId = null;
  if (has('startDate')) {
    if (!validDate(body.startDate)) return null;
    out.startDate = body.startDate;
  }
  if (has('repeat')) {
    if (!REPEATS.includes(body.repeat as Repeat)) return null;
    out.repeat = body.repeat as Repeat;
  }
  if (has('leadDays')) {
    const l = body.leadDays;
    if (typeof l !== 'number' || !Number.isInteger(l) || l < 0 || l > 14) return null;
    out.leadDays = l;
  } else if (full) out.leadDays = 2;
  if (has('onDayAlert')) {
    if (typeof body.onDayAlert !== 'boolean') return null;
    out.onDayAlert = body.onDayAlert;
  } else if (full) out.onDayAlert = false;
  return out;
}

export function eventRoutes(deps: Deps) {
  const r = new Hono();
  const events = makeEventsRepo(deps.db);

  r.get('/events', async (c) => c.json({ events: await events.list() }));

  // Registered before the /events/:id routes so "occurrences" is never read as an id.
  r.get('/events/occurrences', async (c) => {
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!validDate(from) || !validDate(to) || to < from || daysBetween(from, to) > MAX_RANGE_DAYS) {
      return c.json({ error: 'bad_range' }, 400);
    }
    const [all, stored] = await Promise.all([events.list(), events.statuses(from, to)]);
    const byKey = new Map(stored.map((s) => [`${s.eventId}:${s.date}`, s]));
    const out = all
      .flatMap((e) =>
        occurrences(e, from, to).map((date) => {
          const s = byKey.get(`${e.id}:${date}`);
          return {
            eventId: e.id,
            date,
            status: s?.status ?? null,
            source: s?.source ?? null,
            transactionId: s?.transactionId ?? null,
            payable: isPayable(e),
          };
        }),
      )
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.eventId - b.eventId));
    return c.json({ events: all, occurrences: out });
  });

  r.post('/events', async (c) => {
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    const fields = isObject(body) ? await parseFields(body, true, events.accountExists) : null;
    if (!fields) return c.json({ error: 'bad_event' }, 400);
    return c.json(await events.create(fields as EventFields), 201);
  });

  r.patch('/events/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    const fields = isObject(body) ? await parseFields(body, false, events.accountExists) : null;
    if (!fields) return c.json({ error: 'bad_event' }, 400);
    const updated = await events.update(id, fields);
    if (!updated) return c.json({ error: 'event_not_found' }, 404);
    return c.json(updated);
  });

  r.delete('/events/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    if (!(await events.remove(id))) return c.json({ error: 'event_not_found' }, 404);
    return c.body(null, 204);
  });

  r.put('/events/:id/occurrences/:date', async (c) => {
    const id = parseId(c.req.param('id'));
    const date = c.req.param('date');
    if (id === null || !validDate(date)) return c.json({ error: 'bad_id' }, 400);
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    const status = isObject(body) ? body.status : undefined;
    if (status !== null && status !== 'paid' && status !== 'skipped') return c.json({ error: 'bad_status' }, 400);
    const event = await events.get(id);
    if (!event) return c.json({ error: 'event_not_found' }, 404);
    if (!isOccurrence(event, date)) return c.json({ error: 'not_an_occurrence' }, 400);
    await events.setStatus(id, date, status, 'user');
    return c.json({ eventId: id, date, status });
  });

  return r;
}

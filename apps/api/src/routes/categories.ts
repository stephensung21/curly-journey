import type { CategoryColor } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeRepo } from '../db/repo';
import { isObject, parseId, readJson } from './http';

const COLORS: CategoryColor[] = ['orange', 'lime', 'blue', 'yellow', 'pink', 'purple', 'line'];

export function categoryRoutes(deps: Deps) {
  const r = new Hono();
  const repo = makeRepo(deps.db);

  r.get('/categories', async (c) => c.json({ categories: await repo.listCategories() }));

  r.post('/categories', async (c) => {
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    if (!isObject(body)) return c.json({ error: 'bad_category' }, 400);
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const { emoji, color, kind } = body;
    if (
      name.length < 1 || name.length > 40 ||
      typeof emoji !== 'string' || emoji.length < 1 || emoji.length > 8 ||
      typeof color !== 'string' || !COLORS.includes(color as CategoryColor) ||
      (kind !== 'spending' && kind !== 'income')
    ) {
      return c.json({ error: 'bad_category' }, 400);
    }
    const created = await repo.createCategory({ name, emoji, color, kind });
    if (!created) return c.json({ error: 'category_exists' }, 409);
    return c.json(created, 201);
  });

  r.put('/categories/order', async (c) => {
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    const ids = isObject(body) ? body.ids : undefined;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((n) => Number.isInteger(n) && n > 0 && n <= 2147483647)) {
      return c.json({ error: 'bad_order' }, 400);
    }
    if (!(await repo.setCategoryOrder(ids as number[]))) return c.json({ error: 'bad_order' }, 400);
    return c.json({ ok: true });
  });

  r.patch('/categories/:id', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    if (!isObject(body)) return c.json({ error: 'bad_category' }, 400);
    const name = typeof body.name === 'string' ? body.name.trim() : body.name;
    const { emoji, color } = body;
    if (
      (name === undefined && emoji === undefined && color === undefined) ||
      (name !== undefined && (typeof name !== 'string' || name.length < 1 || name.length > 40)) ||
      (emoji !== undefined && (typeof emoji !== 'string' || emoji.length < 1 || emoji.length > 8)) ||
      (color !== undefined && (typeof color !== 'string' || !COLORS.includes(color as CategoryColor)))
    ) {
      return c.json({ error: 'bad_category' }, 400);
    }
    const updated = await repo.updateCategory(id, { name, emoji, color } as { name?: string; emoji?: string; color?: string });
    if (updated === 'exists') return c.json({ error: 'category_exists' }, 409);
    if (!updated) return c.json({ error: 'category_not_found' }, 404);
    return c.json(updated);
  });

  r.post('/categories/:id/merge', async (c) => {
    const id = parseId(c.req.param('id'));
    if (id === null) return c.json({ error: 'bad_id' }, 400);
    const body = await readJson(c);
    if (body === undefined) return c.json({ error: 'bad_json' }, 400);
    const into = isObject(body) ? body.into : undefined;
    if (typeof into !== 'number' || !Number.isInteger(into) || into <= 0 || into > 2147483647 || into === id) {
      return c.json({ error: 'bad_merge' }, 400);
    }
    if (!(await repo.mergeCategory(id, into))) return c.json({ error: 'category_not_found' }, 404);
    return c.json({ ok: true });
  });

  return r;
}

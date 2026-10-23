import type { CategoryColor } from '@curly/core';
import { Hono } from 'hono';
import type { Deps } from '../app';
import { makeRepo } from '../db/repo';
import { isObject, readJson } from './http';

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

  return r;
}

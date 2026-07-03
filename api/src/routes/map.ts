import { Hono } from 'hono';
import type { Env } from '../types';
import { getSupabase } from '../lib/supabase';
import { parseYear } from '../lib/validate';

export const map = new Hono<Env>();

// ---- GET /api/map/summary ----
// 都道府県コード -> 物語数（hidden 除外）。任意で year 絞り込み。
// プロトタイプ規模のため JS 側で集計する（専用 RPC は用意しない）。
map.get('/summary', async (c) => {
  const sb = getSupabase(c.env);
  let query = sb.from('stories').select('prefecture').eq('is_hidden', false);

  const yearRaw = c.req.query('year');
  if (yearRaw !== undefined) query = query.eq('year', parseYear(yearRaw));

  const { data, error } = await query.range(0, 99999);
  if (error) throw error;

  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    const key = String((row as any).prefecture);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return c.json({ counts });
});

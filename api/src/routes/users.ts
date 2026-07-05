import { Hono } from 'hono';
import type { Env } from '../types';
import { getSupabase } from '../lib/supabase';
import { notFound } from '../lib/errors';

export const users = new Hono<Env>();

// ---- GET /api/users/:handle ----
users.get('/:handle', async (c) => {
  const handle = c.req.param('handle');
  const sb = getSupabase(c.env);

  const { data: user, error } = await sb
    .from('users')
    .select('id, handle, username')
    .eq('handle', handle)
    .maybeSingle();
  if (error) throw error;
  if (!user) throw notFound('ユーザーが見つかりません');

  const { count, error: cErr } = await sb
    .from('stories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_hidden', false);
  if (cErr) throw cErr;

  return c.json({ handle: user.handle, username: user.username, storyCount: count ?? 0 });
});

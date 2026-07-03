import { Hono } from 'hono';
import type { Env } from '../types';
import { getSupabase } from '../lib/supabase';
import { notFound } from '../lib/errors';

export const users = new Hono<Env>();

// ---- GET /api/users/:publicId ----
users.get('/:publicId', async (c) => {
  const publicId = c.req.param('publicId');
  const sb = getSupabase(c.env);

  const { data: user, error } = await sb
    .from('users')
    .select('id, public_id, username')
    .eq('public_id', publicId)
    .maybeSingle();
  if (error) throw error;
  if (!user) throw notFound('ユーザーが見つかりません');

  const { count, error: cErr } = await sb
    .from('stories')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_hidden', false);
  if (cErr) throw cErr;

  return c.json({ publicId: user.public_id, username: user.username, storyCount: count ?? 0 });
});

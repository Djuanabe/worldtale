import { Hono } from 'hono';
import type { Env } from '../types';
import { getSupabase } from '../lib/supabase';
import { badRequest, notFound } from '../lib/errors';
import { optionalAuth, requireAuth } from '../lib/auth';

export const users = new Hono<Env>();

// ---- GET /api/users/:handle （任意認証: ログイン中なら isFollowing を返す）----
users.get('/:handle', optionalAuth, async (c) => {
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

  // 見守り状態（本人・未ログインは null）。フォロー/フォロワー数は本人のみなのでここでは返さない。
  const viewerId = c.get('userId');
  let isFollowing: boolean | null = null;
  let isSelf = false;
  if (viewerId) {
    isSelf = viewerId === user.id;
    if (!isSelf) {
      const { data: fRow, error: fErr } = await sb
        .from('follows')
        .select('follower_id', { head: false })
        .eq('follower_id', viewerId)
        .eq('following_id', user.id)
        .maybeSingle();
      if (fErr) throw fErr;
      isFollowing = !!fRow;
    }
  }

  return c.json({
    handle: user.handle,
    username: user.username,
    storyCount: count ?? 0,
    isSelf,
    isFollowing,
  });
});

// ---- POST /api/users/:handle/follow （見守るトグル・要ログイン）----
users.post('/:handle/follow', requireAuth, async (c) => {
  const handle = c.req.param('handle');
  const viewerId = c.get('userId');
  const sb = getSupabase(c.env);

  const { data: target, error } = await sb
    .from('users')
    .select('id')
    .eq('handle', handle)
    .maybeSingle();
  if (error) throw error;
  if (!target) throw notFound('ユーザーが見つかりません');
  if (target.id === viewerId) throw badRequest('自分自身は見守れません');

  const { data: existing, error: eErr } = await sb
    .from('follows')
    .select('follower_id')
    .eq('follower_id', viewerId)
    .eq('following_id', target.id)
    .maybeSingle();
  if (eErr) throw eErr;

  if (existing) {
    const { error: dErr } = await sb
      .from('follows')
      .delete()
      .eq('follower_id', viewerId)
      .eq('following_id', target.id);
    if (dErr) throw dErr;
    return c.json({ isFollowing: false });
  }

  const { error: iErr } = await sb
    .from('follows')
    .insert({ follower_id: viewerId, following_id: target.id });
  if (iErr) throw iErr;
  return c.json({ isFollowing: true });
});

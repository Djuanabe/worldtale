import { Hono } from 'hono';
import type { Env } from '../types';
import { getSupabase, publicPhotoUrl } from '../lib/supabase';
import { requireAuth } from '../lib/auth';
import { countReactionsFor } from '../lib/reactions';

export const my = new Hono<Env>();

// ---- GET /api/my/stories （自分の物語一覧・stats 込み・hidden 含む）----
my.get('/stories', requireAuth, async (c) => {
  const sb = getSupabase(c.env);
  const { data, error } = await sb
    .from('stories')
    .select('id, title, body, prefecture, municipality, year, season, views, is_hidden, created_at, updated_at')
    .eq('user_id', c.get('userId'))
    .order('created_at', { ascending: false });
  if (error) throw error;

  const rows = data ?? [];
  const counts = await countReactionsFor(sb, rows.map((r: any) => r.id));

  const list = rows.map((r: any) => {
    const rc = counts.get(r.id)!;
    return {
      id: r.id,
      title: r.title,
      prefecture: r.prefecture,
      municipality: r.municipality ?? null,
      year: r.year,
      season: r.season ?? null,
      isHidden: r.is_hidden,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      views: Number(r.views),
      likeCount: rc.likeCount,
      metCount: rc.metCount,
    };
  });

  return c.json({ stories: list });
});

// ---- GET /api/my/photos （自分の写真一覧・hidden 含む）----
my.get('/photos', requireAuth, async (c) => {
  const sb = getSupabase(c.env);
  const { data, error } = await sb
    .from('photos')
    .select('id, prefecture, season, storage_path, story_id, is_hidden, created_at')
    .eq('user_id', c.get('userId'))
    .order('created_at', { ascending: false });
  if (error) throw error;

  const list = (data ?? []).map((p: any) => ({
    id: p.id,
    url: publicPhotoUrl(c.env, p.storage_path),
    prefecture: p.prefecture,
    season: p.season,
    storyId: p.story_id,
    isHidden: p.is_hidden,
    createdAt: p.created_at,
  }));

  return c.json({ photos: list });
});

// ---- GET /api/my/follow-stats （見守り数・本人のみ）----
my.get('/follow-stats', requireAuth, async (c) => {
  const sb = getSupabase(c.env);
  const userId = c.get('userId');

  // 見守り中（自分がフォローしている人数）
  const { count: following, error: e1 } = await sb
    .from('follows')
    .select('following_id', { count: 'exact', head: true })
    .eq('follower_id', userId);
  if (e1) throw e1;

  // 見守られ中（自分をフォローしている人数）
  const { count: followers, error: e2 } = await sb
    .from('follows')
    .select('follower_id', { count: 'exact', head: true })
    .eq('following_id', userId);
  if (e2) throw e2;

  return c.json({ followingCount: following ?? 0, followerCount: followers ?? 0 });
});

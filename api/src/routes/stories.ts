import { Hono } from 'hono';
import type { Env } from '../types';
import { REACTION_TYPES, SEASONS } from '../types';
import { getSupabase, publicPhotoUrl } from '../lib/supabase';
import { requireAuth } from '../lib/auth';
import { badRequest, forbidden, isUniqueViolation, notFound } from '../lib/errors';
import { excerpt, oneOf, parsePrefecture, parseYear, requireString } from '../lib/validate';
import { countReactionsFor, summarizeReactions } from '../lib/reactions';

export const stories = new Hono<Env>();

// ---- GET /api/stories （一覧・公開）----
stories.get('/', async (c) => {
  const sb = getSupabase(c.env);
  const q = c.req.query();

  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(q.limit) || 20));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = sb
    .from('stories')
    .select('id, title, body, prefecture, municipality, year, season, created_at, user:users!inner(username, public_id)', {
      count: 'exact',
    })
    .eq('is_hidden', false);

  if (q.prefecture !== undefined) query = query.eq('prefecture', parsePrefecture(q.prefecture));
  if (q.year !== undefined) query = query.eq('year', parseYear(q.year));
  if (q.userId) {
    const { data: u, error: uErr } = await sb
      .from('users')
      .select('id')
      .eq('public_id', q.userId)
      .maybeSingle();
    if (uErr) throw uErr;
    if (!u) return c.json({ stories: [], total: 0, page });
    query = query.eq('user_id', u.id);
  }

  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);
  if (error) throw error;

  const rows = data ?? [];
  const counts = await countReactionsFor(sb, rows.map((r: any) => r.id));

  const list = rows.map((r: any) => {
    const rc = counts.get(r.id)!;
    return {
      id: r.id,
      title: r.title,
      excerpt: excerpt(r.body, 120),
      prefecture: r.prefecture,
      municipality: r.municipality ?? null,
      year: r.year,
      season: r.season ?? null,
      username: r.user?.username ?? '',
      userPublicId: r.user?.public_id ?? '',
      createdAt: r.created_at,
      likeCount: rc.likeCount,
      metCount: rc.metCount,
    };
  });

  return c.json({ stories: list, total: count ?? 0, page });
});

// ---- POST /api/stories （投稿・要ログイン）----
stories.post('/', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('JSON ボディが必要です');
  const title = requireString((body as any).title, 'title', 1, 100);
  const text = requireString((body as any).body, 'body', 1, 20000);
  const prefecture = parsePrefecture((body as any).prefecture);
  const municipality = requireString((body as any).municipality, 'municipality', 1, 50);
  const year = parseYear((body as any).year);
  const season = oneOf((body as any).season, SEASONS, 'season');

  const sb = getSupabase(c.env);
  const { data, error } = await sb
    .from('stories')
    .insert({ user_id: c.get('userId'), title, body: text, prefecture, municipality, year, season })
    .select('id, title, body, prefecture, municipality, year, season, created_at, updated_at')
    .single();
  if (error) throw error;

  return c.json(
    {
      id: data.id,
      title: data.title,
      body: data.body,
      prefecture: data.prefecture,
      municipality: data.municipality,
      year: data.year,
      season: data.season,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
    201
  );
});

// ---- GET /api/stories/:id/stats （本人のみ）----
stories.get('/:id/stats', requireAuth, async (c) => {
  const id = c.req.param('id');
  const sb = getSupabase(c.env);
  const { data: story, error } = await sb
    .from('stories')
    .select('id, user_id, views')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!story) throw notFound('物語が見つかりません');
  if (story.user_id !== c.get('userId')) throw forbidden();

  const { likeCount, metCount } = await summarizeReactions(sb, id);
  return c.json({ views: Number(story.views), likeCount, metCount });
});

// ---- POST /api/stories/:id/reactions （トグル・登録不要）----
stories.post('/:id/reactions', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('JSON ボディが必要です');
  const type = oneOf((body as any).type, REACTION_TYPES, 'type');
  const anonToken = requireString((body as any).anonToken, 'anonToken', 1, 200);

  const sb = getSupabase(c.env);
  const { data: story, error: sErr } = await sb
    .from('stories')
    .select('id, is_hidden')
    .eq('id', id)
    .maybeSingle();
  if (sErr) throw sErr;
  if (!story || story.is_hidden) throw notFound('物語が見つかりません');

  const { data: existing, error: eErr } = await sb
    .from('reactions')
    .select('id')
    .eq('story_id', id)
    .eq('type', type)
    .eq('anon_token', anonToken)
    .maybeSingle();
  if (eErr) throw eErr;

  if (existing) {
    const { error } = await sb.from('reactions').delete().eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await sb
      .from('reactions')
      .insert({ story_id: id, type, anon_token: anonToken });
    // 同時押しで unique 衝突した場合は「既に反応済み」として扱い、以降で再集計する
    if (error && !isUniqueViolation(error)) throw error;
  }

  const summary = await summarizeReactions(sb, id, anonToken);
  return c.json(summary);
});

// ---- GET /api/stories/:id/reactions ----
stories.get('/:id/reactions', async (c) => {
  const id = c.req.param('id');
  const anonToken = c.req.query('anonToken');
  const sb = getSupabase(c.env);

  const { data: story, error } = await sb
    .from('stories')
    .select('id, is_hidden')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!story || story.is_hidden) throw notFound('物語が見つかりません');

  const summary = await summarizeReactions(sb, id, anonToken || undefined);
  return c.json(summary);
});

// ---- GET /api/stories/:id （本文込み・公開／views をインクリメント）----
stories.get('/:id', async (c) => {
  const id = c.req.param('id');
  const sb = getSupabase(c.env);

  const { data: story, error } = await sb
    .from('stories')
    .select('id, title, body, prefecture, municipality, year, season, created_at, updated_at, is_hidden, user:users!inner(username, public_id)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!story || (story as any).is_hidden) throw notFound('物語が見つかりません');

  // 閲覧数インクリメント（RPC）
  const { error: rpcErr } = await sb.rpc('increment_views', { p_story_id: id });
  if (rpcErr) throw rpcErr;

  const { likeCount, metCount } = await summarizeReactions(sb, id);

  const { data: photos, error: pErr } = await sb
    .from('photos')
    .select('id, season, storage_path')
    .eq('story_id', id)
    .eq('is_hidden', false)
    .order('created_at', { ascending: true });
  if (pErr) throw pErr;

  const s = story as any;
  return c.json({
    id: s.id,
    title: s.title,
    body: s.body,
    prefecture: s.prefecture,
    municipality: s.municipality ?? null,
    year: s.year,
    season: s.season ?? null,
    username: s.user?.username ?? '',
    userPublicId: s.user?.public_id ?? '',
    createdAt: s.created_at,
    updatedAt: s.updated_at,
    likeCount,
    metCount,
    photos: (photos ?? []).map((p: any) => ({
      id: p.id,
      url: publicPhotoUrl(c.env, p.storage_path),
      season: p.season,
    })),
  });
});

// ---- PUT /api/stories/:id （本人のみ・部分更新）----
stories.put('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('JSON ボディが必要です');

  const sb = getSupabase(c.env);
  const { data: story, error } = await sb
    .from('stories')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!story) throw notFound('物語が見つかりません');
  if (story.user_id !== c.get('userId')) throw forbidden();

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const b = body as any;
  if (b.title !== undefined) patch.title = requireString(b.title, 'title', 1, 100);
  if (b.body !== undefined) patch.body = requireString(b.body, 'body', 1, 20000);
  if (b.prefecture !== undefined) patch.prefecture = parsePrefecture(b.prefecture);
  if (b.municipality !== undefined) patch.municipality = requireString(b.municipality, 'municipality', 1, 50);
  if (b.year !== undefined) patch.year = parseYear(b.year);
  if (b.season !== undefined) patch.season = oneOf(b.season, SEASONS, 'season');

  const { data: updated, error: uErr } = await sb
    .from('stories')
    .update(patch)
    .eq('id', id)
    .select('id, title, body, prefecture, municipality, year, season, created_at, updated_at')
    .single();
  if (uErr) throw uErr;

  return c.json({
    id: updated.id,
    title: updated.title,
    body: updated.body,
    prefecture: updated.prefecture,
    municipality: updated.municipality,
    year: updated.year,
    season: updated.season,
    createdAt: updated.created_at,
    updatedAt: updated.updated_at,
  });
});

// ---- DELETE /api/stories/:id （本人のみ・添付写真も Storage ごと削除）----
stories.delete('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const sb = getSupabase(c.env);

  const { data: story, error } = await sb
    .from('stories')
    .select('id, user_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!story) throw notFound('物語が見つかりません');
  if (story.user_id !== c.get('userId')) throw forbidden();

  // 添付写真を Storage・DB ともに削除
  const { data: photos, error: pErr } = await sb
    .from('photos')
    .select('id, storage_path')
    .eq('story_id', id);
  if (pErr) throw pErr;

  if (photos && photos.length > 0) {
    const paths = photos.map((p: any) => p.storage_path);
    const { error: rmErr } = await sb.storage.from('photos').remove(paths);
    if (rmErr) throw rmErr;
    const { error: delErr } = await sb
      .from('photos')
      .delete()
      .in('id', photos.map((p: any) => p.id));
    if (delErr) throw delErr;
  }

  const { error: dErr } = await sb.from('stories').delete().eq('id', id);
  if (dErr) throw dErr;

  return c.json({ ok: true });
});

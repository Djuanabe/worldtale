import { Hono } from 'hono';
import type { Env } from '../types';
import { getSupabase } from '../lib/supabase';
import { requireAdmin } from '../lib/auth';
import { badRequest, notFound } from '../lib/errors';
import { excerpt, oneOf, requireString } from '../lib/validate';

export const admin = new Hono<Env>();

// すべて管理者のみ
admin.use('*', requireAdmin);

// ---- GET /api/admin/reports?status=open|resolved|dismissed|all ----
admin.get('/reports', async (c) => {
  const sb = getSupabase(c.env);
  const status = c.req.query('status') ?? 'open';

  let query = sb
    .from('reports')
    .select('id, target_type, target_id, reason, detail, status, created_at, reporter_id')
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'all') query = query.eq('status', status);

  const { data: reports, error } = await query;
  if (error) throw error;
  const rows = reports ?? [];

  // 参照先をまとめて取得（N+1 回避）
  const storyIds = rows.filter((r: any) => r.target_type === 'story').map((r: any) => r.target_id);
  const photoIds = rows.filter((r: any) => r.target_type === 'photo').map((r: any) => r.target_id);
  const reporterIds = rows.map((r: any) => r.reporter_id);

  const storyMap = new Map<string, any>();
  if (storyIds.length) {
    const { data, error: e } = await sb
      .from('stories')
      .select('id, title, body, is_hidden, prefecture, user:users!inner(handle, username)')
      .in('id', storyIds);
    if (e) throw e;
    for (const s of data ?? []) storyMap.set(s.id, s);
  }
  const photoMap = new Map<string, any>();
  if (photoIds.length) {
    const { data, error: e } = await sb
      .from('photos')
      .select('id, storage_path, is_hidden, user:users!inner(handle, username)')
      .in('id', photoIds);
    if (e) throw e;
    for (const p of data ?? []) photoMap.set(p.id, p);
  }
  const reporterMap = new Map<string, any>();
  if (reporterIds.length) {
    const { data, error: e } = await sb.from('users').select('id, handle').in('id', reporterIds);
    if (e) throw e;
    for (const u of data ?? []) reporterMap.set(u.id, u);
  }

  const base = c.env.SUPABASE_URL.replace(/\/+$/, '');
  const list = rows.map((r: any) => {
    let target: any = null;
    if (r.target_type === 'story') {
      const s = storyMap.get(r.target_id);
      if (s) {
        target = {
          exists: true,
          isHidden: s.is_hidden,
          title: s.title,
          excerpt: excerpt(s.body, 160),
          authorHandle: s.user?.handle ?? '',
          authorUsername: s.user?.username ?? '',
        };
      }
    } else {
      const p = photoMap.get(r.target_id);
      if (p) {
        target = {
          exists: true,
          isHidden: p.is_hidden,
          url: `${base}/storage/v1/object/public/photos/${p.storage_path}`,
          authorHandle: p.user?.handle ?? '',
          authorUsername: p.user?.username ?? '',
        };
      }
    }
    if (!target) target = { exists: false };
    return {
      id: r.id,
      targetType: r.target_type,
      targetId: r.target_id,
      reason: r.reason,
      detail: r.detail ?? null,
      status: r.status,
      createdAt: r.created_at,
      reporterHandle: reporterMap.get(r.reporter_id)?.handle ?? '',
      target,
    };
  });

  return c.json({ reports: list });
});

// ---- POST /api/admin/reports/:id/status  { status } ----
admin.post('/reports/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const status = oneOf((body as any)?.status, ['open', 'resolved', 'dismissed'] as const, 'status');
  const sb = getSupabase(c.env);
  const { data, error } = await sb
    .from('reports')
    .update({ status })
    .eq('id', id)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('報告が見つかりません');
  return c.json({ id, status });
});

// ---- POST /api/admin/stories/:id/visibility  { hidden } ----
admin.post('/stories/:id/visibility', async (c) => {
  return setVisibility(c, 'stories', c.req.param('id'));
});
// ---- POST /api/admin/photos/:id/visibility  { hidden } ----
admin.post('/photos/:id/visibility', async (c) => {
  return setVisibility(c, 'photos', c.req.param('id'));
});

async function setVisibility(c: any, table: 'stories' | 'photos', id: string) {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof (body as any).hidden !== 'boolean') throw badRequest('hidden(boolean) が必要です');
  const sb = getSupabase(c.env);
  const { data, error } = await sb
    .from(table)
    .update({ is_hidden: (body as any).hidden })
    .eq('id', id)
    .select('id, is_hidden')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound('対象が見つかりません');
  return c.json({ id, isHidden: data.is_hidden });
}

// ---- DELETE /api/admin/stories/:id （添付写真も Storage ごと削除）----
admin.delete('/stories/:id', async (c) => {
  const id = c.req.param('id');
  const sb = getSupabase(c.env);
  const { data: story, error } = await sb.from('stories').select('id').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!story) throw notFound('物語が見つかりません');

  const { data: photos, error: pErr } = await sb.from('photos').select('id, storage_path').eq('story_id', id);
  if (pErr) throw pErr;
  if (photos && photos.length) {
    await sb.storage.from('photos').remove(photos.map((p: any) => p.storage_path));
    await sb.from('photos').delete().in('id', photos.map((p: any) => p.id));
  }
  const { error: dErr } = await sb.from('stories').delete().eq('id', id);
  if (dErr) throw dErr;
  return c.json({ ok: true });
});

// ---- DELETE /api/admin/photos/:id ----
admin.delete('/photos/:id', async (c) => {
  const id = c.req.param('id');
  const sb = getSupabase(c.env);
  const { data: photo, error } = await sb.from('photos').select('id, storage_path').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!photo) throw notFound('写真が見つかりません');
  await sb.storage.from('photos').remove([photo.storage_path]);
  const { error: dErr } = await sb.from('photos').delete().eq('id', id);
  if (dErr) throw dErr;
  return c.json({ ok: true });
});

// ---- POST /api/admin/warnings  { handle, message } ----
admin.post('/warnings', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('JSON ボディが必要です');
  const handle = requireString((body as any).handle, 'handle', 1, 32);
  const message = requireString((body as any).message, 'message', 1, 2000);

  const sb = getSupabase(c.env);
  const { data: user, error } = await sb.from('users').select('id').eq('handle', handle).maybeSingle();
  if (error) throw error;
  if (!user) throw notFound('ユーザーが見つかりません');

  const { data, error: iErr } = await sb
    .from('warnings')
    .insert({ user_id: user.id, message })
    .select('id')
    .single();
  if (iErr) throw iErr;
  return c.json({ id: data.id }, 201);
});

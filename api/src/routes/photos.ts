import { Hono } from 'hono';
import type { Env } from '../types';
import { SEASONS } from '../types';
import { getSupabase, publicPhotoUrl } from '../lib/supabase';
import { requireAuth } from '../lib/auth';
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from '../lib/errors';
import { oneOf, parsePrefecture } from '../lib/validate';

export const photos = new Hono<Env>();

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// ---- POST /api/photos （multipart アップロード・要ログイン）----
photos.post('/', requireAuth, async (c) => {
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    throw badRequest('multipart/form-data が必要です');
  }

  // workers-types 上は FormData.get の戻り値が string | null 扱いだが、
  // 実行時はアップロードされた File が返る。File として扱う。
  const fileEntry = form.get('file') as unknown;
  if (fileEntry == null || typeof fileEntry === 'string') throw badRequest('file が必要です');
  const file = fileEntry as File;
  const ext = MIME_EXT[file.type];
  if (!ext) throw badRequest('画像は JPEG / PNG / WebP のみ対応しています', 'UNSUPPORTED_MEDIA_TYPE');
  if (file.size <= 0) throw badRequest('ファイルが空です');
  if (file.size > MAX_BYTES) throw badRequest('画像は 5MB までです', 'FILE_TOO_LARGE');

  const prefecture = parsePrefecture(form.get('prefecture'));
  const season = oneOf(form.get('season'), SEASONS, 'season');

  const userId = c.get('userId');
  const sb = getSupabase(c.env);

  // storyId が指定された場合は本人の物語かどうか確認
  let storyId: string | null = null;
  const rawStoryId = form.get('storyId');
  if (typeof rawStoryId === 'string' && rawStoryId.length > 0) {
    const { data: story, error } = await sb
      .from('stories')
      .select('id, user_id')
      .eq('id', rawStoryId)
      .maybeSingle();
    if (error) throw error;
    if (!story) throw notFound('物語が見つかりません');
    if (story.user_id !== userId) throw forbidden('自分の物語にのみ写真を紐づけられます');
    storyId = story.id;
  }

  const storagePath = `${userId}/${prefecture}-${season}-${crypto.randomUUID()}.${ext}`;

  // 先に DB 行を作成し、unique(user_id,prefecture,season) 違反を 409 として返す
  const { data: inserted, error: insErr } = await sb
    .from('photos')
    .insert({
      user_id: userId,
      story_id: storyId,
      prefecture,
      season,
      storage_path: storagePath,
    })
    .select('id, prefecture, season')
    .single();
  if (insErr) {
    if (isUniqueViolation(insErr)) {
      throw conflict('この場所・季節の枠は既に使用されています', 'PHOTO_SLOT_TAKEN');
    }
    throw insErr;
  }

  // Storage へアップロード。失敗したら DB 行をロールバック。
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await sb.storage
    .from('photos')
    .upload(storagePath, bytes, { contentType: file.type, upsert: false });
  if (upErr) {
    await sb.from('photos').delete().eq('id', inserted.id);
    throw new Error(`Storage upload failed: ${upErr.message}`);
  }

  return c.json(
    {
      id: inserted.id,
      url: publicPhotoUrl(c.env, storagePath),
      prefecture: inserted.prefecture,
      season: inserted.season,
    },
    201
  );
});

// ---- GET /api/photos （背景スライドショー用・公開・hidden 除外・最大30枚）----
photos.get('/', async (c) => {
  const prefectureRaw = c.req.query('prefecture');
  if (prefectureRaw === undefined) throw badRequest('prefecture は必須です');
  const prefecture = parsePrefecture(prefectureRaw);

  const sb = getSupabase(c.env);
  let query = sb
    .from('photos')
    .select('id, season, storage_path, user:users!inner(username)')
    .eq('prefecture', prefecture)
    .eq('is_hidden', false);

  const seasonRaw = c.req.query('season');
  if (seasonRaw !== undefined) query = query.eq('season', oneOf(seasonRaw, SEASONS, 'season'));

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw error;

  const list = (data ?? []).map((p: any) => ({
    id: p.id,
    url: publicPhotoUrl(c.env, p.storage_path),
    season: p.season,
    username: p.user?.username ?? '',
  }));

  return c.json({ photos: list });
});

// ---- DELETE /api/photos/:id （本人のみ・Storage からも削除）----
photos.delete('/:id', requireAuth, async (c) => {
  const id = c.req.param('id');
  const sb = getSupabase(c.env);

  const { data: photo, error } = await sb
    .from('photos')
    .select('id, user_id, storage_path')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!photo) throw notFound('写真が見つかりません');
  if (photo.user_id !== c.get('userId')) throw forbidden();

  const { error: rmErr } = await sb.storage.from('photos').remove([photo.storage_path]);
  if (rmErr) throw rmErr;

  const { error: delErr } = await sb.from('photos').delete().eq('id', id);
  if (delErr) throw delErr;

  return c.json({ ok: true });
});

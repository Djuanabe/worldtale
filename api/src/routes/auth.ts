import { Hono } from 'hono';
import type { Env } from '../types';
import { getSupabase } from '../lib/supabase';
import {
  generatePublicId,
  hashPassword,
  issueToken,
  requireAuth,
  verifyPassword,
} from '../lib/auth';
import { badRequest, isUniqueViolation, notFound, unauthorized } from '../lib/errors';
import { requireString } from '../lib/validate';

export const auth = new Hono<Env>();

// POST /api/auth/register
auth.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('JSON ボディが必要です');
  const username = requireString((body as any).username, 'username', 1, 30);
  const password = requireString((body as any).password, 'password', 8, 200);

  const sb = getSupabase(c.env);
  const passwordHash = await hashPassword(password);

  // public_id の unique 衝突時はリトライ
  let publicId = '';
  let userId = '';
  for (let attempt = 0; attempt < 6; attempt++) {
    publicId = generatePublicId();
    const { data, error } = await sb
      .from('users')
      .insert({ public_id: publicId, username, password_hash: passwordHash })
      .select('id, public_id, username')
      .single();
    if (!error && data) {
      userId = data.id;
      break;
    }
    if (error && isUniqueViolation(error)) continue; // public_id 衝突 → 再生成
    if (error) throw error;
  }
  if (!userId) throw new Error('public_id の生成に繰り返し失敗しました');

  const token = await issueToken(userId, c.env.JWT_SECRET);
  return c.json({ user: { publicId, username }, token }, 201);
});

// POST /api/auth/login
auth.post('/login', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('JSON ボディが必要です');
  const publicId = requireString((body as any).publicId, 'publicId', 1, 32);
  const password = requireString((body as any).password, 'password', 1, 200);

  const sb = getSupabase(c.env);
  const { data: user, error } = await sb
    .from('users')
    .select('id, public_id, username, password_hash')
    .eq('public_id', publicId)
    .maybeSingle();
  if (error) throw error;
  if (!user) throw unauthorized('ユーザーIDまたはパスワードが違います');

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) throw unauthorized('ユーザーIDまたはパスワードが違います');

  const token = await issueToken(user.id, c.env.JWT_SECRET);
  return c.json({ user: { publicId: user.public_id, username: user.username }, token });
});

// GET /api/auth/me
auth.get('/me', requireAuth, async (c) => {
  const sb = getSupabase(c.env);
  const { data: user, error } = await sb
    .from('users')
    .select('public_id, username')
    .eq('id', c.get('userId'))
    .maybeSingle();
  if (error) throw error;
  if (!user) throw notFound('ユーザーが見つかりません');
  return c.json({ user: { publicId: user.public_id, username: user.username } });
});

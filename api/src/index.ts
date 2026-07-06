import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from './types';
import { ApiError } from './lib/errors';
import { auth } from './routes/auth';
import { stories } from './routes/stories';
import { my } from './routes/my';
import { users } from './routes/users';
import { photos } from './routes/photos';
import { reports } from './routes/reports';
import { map } from './routes/map';
import { admin } from './routes/admin';

const app = new Hono<Env>();

// CORS: ALLOWED_ORIGIN 未設定時は * を許可
app.use('*', (c, next) => {
  const origin = c.env.ALLOWED_ORIGIN && c.env.ALLOWED_ORIGIN.length > 0 ? c.env.ALLOWED_ORIGIN : '*';
  return cors({
    origin,
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })(c, next);
});

const api = new Hono<Env>();

api.get('/health', (c) => c.json({ ok: true }));
api.route('/auth', auth);
api.route('/stories', stories);
api.route('/my', my);
api.route('/users', users);
api.route('/photos', photos);
api.route('/reports', reports);
api.route('/map', map);
api.route('/admin', admin);

app.route('/api', api);

// 統一エラー整形: { error: { code, message } }
app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error('Unhandled error:', err);
  return c.json({ error: { code: 'INTERNAL', message: 'サーバー内部エラー' } }, 500);
});

app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'エンドポイントが見つかりません' } }, 404));

export default app;

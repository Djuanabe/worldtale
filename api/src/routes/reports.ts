import { Hono } from 'hono';
import type { Env } from '../types';
import { REPORT_REASONS, REPORT_TARGETS } from '../types';
import { getSupabase } from '../lib/supabase';
import { requireAuth } from '../lib/auth';
import { badRequest, notFound } from '../lib/errors';
import { oneOf } from '../lib/validate';

export const reports = new Hono<Env>();

// ---- POST /api/reports （要ログイン）----
reports.post('/', requireAuth, async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw badRequest('JSON ボディが必要です');
  const b = body as any;

  const targetType = oneOf(b.targetType, REPORT_TARGETS, 'targetType');
  const targetId = b.targetId;
  if (typeof targetId !== 'string' || !targetId) throw badRequest('targetId が必要です');
  const reason = oneOf(b.reason, REPORT_REASONS, 'reason');
  const detail =
    b.detail === undefined || b.detail === null
      ? null
      : typeof b.detail === 'string'
        ? b.detail.slice(0, 2000)
        : (() => {
            throw badRequest('detail は文字列で指定してください');
          })();

  const sb = getSupabase(c.env);

  // 対象が存在するか確認
  const table = targetType === 'story' ? 'stories' : 'photos';
  const { data: target, error: tErr } = await sb
    .from(table)
    .select('id')
    .eq('id', targetId)
    .maybeSingle();
  if (tErr) throw tErr;
  if (!target) throw notFound('報告対象が見つかりません');

  const { data, error } = await sb
    .from('reports')
    .insert({
      target_type: targetType,
      target_id: targetId,
      reporter_id: c.get('userId'),
      reason,
      detail,
    })
    .select('id')
    .single();
  if (error) throw error;

  return c.json({ id: data.id, status: 'open' }, 201);
});

import type { SupabaseClient } from '@supabase/supabase-js';

export type ReactionSummary = {
  likeCount: number;
  metCount: number;
  reacted: { like: boolean; met: boolean };
};

// 1つの物語のリアクション集計と、任意の anonToken の反応状態を返す
export async function summarizeReactions(
  sb: SupabaseClient,
  storyId: string,
  anonToken?: string
): Promise<ReactionSummary> {
  const { data, error } = await sb
    .from('reactions')
    .select('type, anon_token')
    .eq('story_id', storyId);
  if (error) throw error;

  let likeCount = 0;
  let metCount = 0;
  const reacted = { like: false, met: false };
  for (const row of data ?? []) {
    if (row.type === 'like') likeCount++;
    else if (row.type === 'met') metCount++;
    if (anonToken && row.anon_token === anonToken) {
      if (row.type === 'like') reacted.like = true;
      else if (row.type === 'met') reacted.met = true;
    }
  }
  return { likeCount, metCount, reacted };
}

// 複数の物語の like/met カウントをまとめて取得（一覧用）
export async function countReactionsFor(
  sb: SupabaseClient,
  storyIds: string[]
): Promise<Map<string, { likeCount: number; metCount: number }>> {
  const map = new Map<string, { likeCount: number; metCount: number }>();
  for (const id of storyIds) map.set(id, { likeCount: 0, metCount: 0 });
  if (storyIds.length === 0) return map;

  const { data, error } = await sb
    .from('reactions')
    .select('story_id, type')
    .in('story_id', storyIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const entry = map.get(row.story_id);
    if (!entry) continue;
    if (row.type === 'like') entry.likeCount++;
    else if (row.type === 'met') entry.metCount++;
  }
  return map;
}

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Bindings } from '../types';

// service_role キーで接続する Supabase クライアント（RLS を貫通する）。
// リクエストごとに env から生成する。
export function getSupabase(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// public バケットのオブジェクト URL を組み立てる
export function publicPhotoUrl(env: Bindings, storagePath: string): string {
  const base = env.SUPABASE_URL.replace(/\/+$/, '');
  return `${base}/storage/v1/object/public/photos/${storagePath}`;
}

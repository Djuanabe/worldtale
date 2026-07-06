import { sign, verify } from 'hono/jwt';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { forbidden, unauthorized } from './errors';
import { getSupabase } from './supabase';

// ---- パスワードハッシュ（WebCrypto PBKDF2-SHA256, 16byte salt）----
// Cloudflare Workers の WebCrypto は deriveBits の反復回数を 100,000 までしか
// 許可しない。OWASP 推奨（PBKDF2-SHA256 で 60万回以上）に近づけるため、
// 100,000 回の PBKDF2 を複数段チェインして実効反復回数を引き上げる。
// 各段は「前段の出力を次段のソルトにする」ことで直列化し、総当たり側は全段を
// 順に計算する必要がある（＝実効 ROUNDS×PER_ROUND 回）。
//
// 保存形式:
//   新: pbkdf2c$<rounds>$<perRound>$<salt_b64>$<hash_b64>   （チェイン）
//   旧: pbkdf2$<iter>$<salt_b64>$<hash_b64>                  （単発・後方互換）
//
// ROUNDS は無料枠の CPU 時間制限に触れない範囲で選ぶ。既に PER_ROUND=100,000 の
// 単発が本番で動作しているため、その 3 倍（実効 30 万回）を既定とする。
// プランに余裕があれば ROUNDS を 6（実効 60 万回）に上げてよい。
const PER_ROUND = 100_000;
const ROUNDS = 3;
const SALT_BYTES = 16;
const KEY_BITS = 256;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// 単発 PBKDF2（iterations は Workers 上限の 100,000 以下であること）
async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

// チェイン PBKDF2: 前段の出力を次段のソルトに使う。実効 rounds×perRound 回。
async function pbkdf2Chain(
  password: string,
  salt: Uint8Array,
  rounds: number,
  perRound: number
): Promise<Uint8Array> {
  let out = await pbkdf2(password, salt, perRound);
  for (let i = 1; i < rounds; i++) {
    out = await pbkdf2(password, out, perRound);
  }
  return out;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2Chain(password, salt, ROUNDS, PER_ROUND);
  return `pbkdf2c$${ROUNDS}$${PER_ROUND}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');

  // 新形式: チェイン
  if (parts[0] === 'pbkdf2c' && parts.length === 5) {
    const rounds = Number(parts[1]);
    const perRound = Number(parts[2]);
    if (!Number.isInteger(rounds) || rounds <= 0 || rounds > 64) return false;
    if (!Number.isInteger(perRound) || perRound <= 0 || perRound > PER_ROUND) return false;
    const salt = fromBase64(parts[3]);
    const expected = fromBase64(parts[4]);
    const actual = await pbkdf2Chain(password, salt, rounds, perRound);
    return timingSafeEqual(actual, expected);
  }

  // 旧形式: 単発（既存ユーザーとの後方互換）
  if (parts[0] === 'pbkdf2' && parts.length === 4) {
    const iterations = Number(parts[1]);
    if (!Number.isFinite(iterations) || iterations <= 0 || iterations > PER_ROUND) return false;
    const salt = fromBase64(parts[1 + 1]);
    const expected = fromBase64(parts[3]);
    const actual = await pbkdf2(password, salt, iterations);
    return timingSafeEqual(actual, expected);
  }

  return false;
}

// 保存済みハッシュが現行の推奨パラメータより弱いか（ログイン成功時の再ハッシュ判定用）。
export function needsRehash(stored: string): boolean {
  const parts = stored.split('$');
  if (parts[0] !== 'pbkdf2c' || parts.length !== 5) return true; // 旧形式は要再ハッシュ
  return Number(parts[1]) < ROUNDS || Number(parts[2]) < PER_ROUND;
}

// ---- public_id 生成（Crockford Base32 風・I/L/O/U を除く 10 文字）----
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // 32 文字（I,L,O,U 除外）

export function generatePublicId(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = '';
  for (let i = 0; i < length; i++) id += ALPHABET[bytes[i] % ALPHABET.length];
  return id;
}

// ---- JWT（HS256, 有効期限30日）----
const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;

export async function issueToken(userId: string, secret: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign({ sub: userId, iat: now, exp: now + THIRTY_DAYS_SEC }, secret, 'HS256');
}

// ---- 認証ミドルウェア ----
export const requireAuth: MiddlewareHandler<Env> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (!header || !header.startsWith('Bearer ')) throw unauthorized();
  const token = header.slice(7).trim();
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    const sub = payload.sub;
    if (typeof sub !== 'string' || !sub) throw new Error('no sub');
    c.set('userId', sub);
  } catch {
    throw unauthorized('トークンが無効です');
  }
  await next();
};

// ---- 管理者のみ: requireAuth 済みの userId が is_admin か DB で確認する ----
export const requireAdmin: MiddlewareHandler<Env> = async (c, next) => {
  // 先に requireAuth を通す（トークン検証と userId 設定）
  await requireAuth(c, async () => {});
  const userId = c.get('userId');
  if (!userId) throw unauthorized();
  const sb = getSupabase(c.env);
  const { data, error } = await sb
    .from('users')
    .select('is_admin')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.is_admin !== true) throw forbidden('管理者権限が必要です');
  await next();
};

// ---- 任意認証: トークンがあれば userId を設定、無ければ素通り（拒否しない）----
export const optionalAuth: MiddlewareHandler<Env> = async (c, next) => {
  const header = c.req.header('Authorization');
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice(7).trim();
    try {
      const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
      const sub = payload.sub;
      if (typeof sub === 'string' && sub) c.set('userId', sub);
    } catch {
      // 無効トークンは無視して未ログイン扱い
    }
  }
  await next();
};

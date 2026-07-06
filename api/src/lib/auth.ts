import { sign, verify } from 'hono/jwt';
import type { MiddlewareHandler } from 'hono';
import type { Env } from '../types';
import { unauthorized } from './errors';

// ---- パスワードハッシュ（WebCrypto PBKDF2-SHA256, 100,000 iterations, 16byte salt）----
// 保存形式: pbkdf2$<iter>$<salt_b64>$<hash_b64>
// 反復回数は Cloudflare Workers の WebCrypto 上限（100,000）に合わせる。
// verifyPassword は保存値から反復回数を読むため、将来値を変えても後方互換。

const ITERATIONS = 100_000;
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

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  const actual = await pbkdf2(password, salt, iterations);
  if (actual.length !== expected.length) return false;
  // 定数時間比較
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
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

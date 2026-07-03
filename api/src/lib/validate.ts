import { badRequest } from './errors';

export function requireString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw badRequest(`${field} は文字列で指定してください`);
  const v = value;
  if (v.length < min || v.length > max) {
    throw badRequest(`${field} は ${min}〜${max} 文字で指定してください`);
  }
  return v;
}

// 都道府県コード（1..47）を数値として解釈
export function parsePrefecture(value: unknown, field = 'prefecture'): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 47) {
    throw badRequest(`${field} は 1〜47 の整数で指定してください`);
  }
  return n;
}

export function parseYear(value: unknown, field = 'year'): number {
  const n = typeof value === 'number' ? value : Number(value);
  const thisYear = new Date().getUTCFullYear();
  if (!Number.isInteger(n) || n < 1900 || n > thisYear) {
    throw badRequest(`${field} は 1900〜${thisYear} の整数で指定してください`);
  }
  return n;
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw badRequest(`${field} は ${allowed.join(' | ')} のいずれかで指定してください`);
  }
  return value as T;
}

export function excerpt(body: string, len = 120): string {
  const trimmed = body.replace(/\s+/g, ' ').trim();
  return trimmed.length <= len ? trimmed : trimmed.slice(0, len) + '…';
}

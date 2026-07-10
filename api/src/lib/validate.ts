import { badRequest } from './errors';

export function requireString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== 'string') throw badRequest(`${field} は文字列で指定してください`);
  const v = value;
  if (v.length < min || v.length > max) {
    throw badRequest(`${field} は ${min}〜${max} 文字で指定してください`);
  }
  return v;
}

// 上限なしの文字列（本文用。長さ制限は設けない）
export function requireText(value: unknown, field: string, min: number): string {
  if (typeof value !== 'string') throw badRequest(`${field} は文字列で指定してください`);
  if (value.length < min) throw badRequest(`${field} は ${min} 文字以上で指定してください`);
  return value;
}

// 任意の日付（YYYY-MM-DD）。null/undefined/空文字は null を返す。
// 選択は自由なので範囲チェックはせず、実在する日付かだけ確認する。
export function parseOptionalDate(value: unknown, field = 'storyDate'): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw badRequest(`${field} は YYYY-MM-DD 形式で指定してください`);
  }
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    throw badRequest(`${field} は実在する日付を指定してください`);
  }
  return value;
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

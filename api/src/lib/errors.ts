import type { ContentfulStatusCode } from 'hono/utils/http-status';

// API 全体で共通のエラー。onError で { error: { code, message } } に整形される。
export class ApiError extends Error {
  status: ContentfulStatusCode;
  code: string;
  constructor(status: ContentfulStatusCode, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message: string, code = 'BAD_REQUEST') =>
  new ApiError(400, code, message);
export const unauthorized = (message = '認証が必要です') =>
  new ApiError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = '権限がありません') =>
  new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = '見つかりません', code = 'NOT_FOUND') =>
  new ApiError(404, code, message);
export const conflict = (message: string, code = 'CONFLICT') =>
  new ApiError(409, code, message);

// PostgREST の unique 制約違反かどうか
export const isUniqueViolation = (err: { code?: string } | null): boolean =>
  err?.code === '23505';

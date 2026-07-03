// Worker の環境変数（wrangler secret / .dev.vars で注入される）
export type Bindings = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  JWT_SECRET: string;
  ALLOWED_ORIGIN?: string;
};

// リクエストごとにミドルウェアがセットする値
export type Variables = {
  userId: string;
};

export type Env = {
  Bindings: Bindings;
  Variables: Variables;
};

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

export const REACTION_TYPES = ['like', 'met'] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

export const REPORT_REASONS = ['personal_info', 'face', 'harmful', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_TARGETS = ['story', 'photo'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];

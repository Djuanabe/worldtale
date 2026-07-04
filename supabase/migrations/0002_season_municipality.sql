-- 物語に季節・市区町村を追加（プロトタイプでも投稿時に必須。分類には使わず表示専用）
-- DB上は nullable（既存行のため）。必須化は API のバリデーションで行う。

alter table public.stories
  add column if not exists season text
    check (season is null or season in ('spring','summer','autumn','winter')),
  add column if not exists municipality text
    check (municipality is null or char_length(municipality) between 1 and 50);

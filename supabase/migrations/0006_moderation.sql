-- モデレーション（管理者による報告対応・警告）
-- 管理者は users.is_admin = true のユーザー。Supabase の SQL で手動付与する:
--   update public.users set is_admin = true where public_id = '<自分のログインID>';

alter table public.users add column if not exists is_admin boolean not null default false;

-- 作者への警告（メール不使用のため、アプリ内で本人に通知として表示する）
create table public.warnings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users(id) on delete cascade,
  message         text not null check (char_length(message) between 1 and 2000),
  created_at      timestamptz not null default now(),
  acknowledged_at timestamptz
);

-- 未確認の警告を本人に出すための索引
create index warnings_user_unack_idx on public.warnings (user_id) where acknowledged_at is null;

alter table public.warnings enable row level security;

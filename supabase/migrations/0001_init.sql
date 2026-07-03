-- WorldTale initial schema
-- Supabase SQL Editor で実行するか、supabase db push で適用する

create extension if not exists "pgcrypto";

-- ユーザー（メール不使用: 表示名 / ランダム発行のログインID / パスワードのみ）
create table public.users (
  id            uuid primary key default gen_random_uuid(),
  public_id     text not null unique,
  username      text not null check (char_length(username) between 1 and 30),
  password_hash text not null,
  created_at    timestamptz not null default now()
);

-- 物語（プロトタイプ: 都道府県 × 年）
create table public.stories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  prefecture int  not null check (prefecture between 1 and 47),
  year       int  not null check (year between 1900 and 2100),
  title      text not null check (char_length(title) between 1 and 100),
  body       text not null check (char_length(body) between 1 and 20000),
  views      bigint not null default 0,
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index stories_pref_year_idx on public.stories (prefecture, year) where not is_hidden;
create index stories_user_idx on public.stories (user_id, year);

-- 風景写真（1ユーザー × 1都道府県 × 1季節 につき1枚）
create table public.photos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  story_id     uuid references public.stories(id) on delete set null,
  prefecture   int  not null check (prefecture between 1 and 47),
  season       text not null check (season in ('spring','summer','autumn','winter')),
  storage_path text not null,
  is_hidden    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (user_id, prefecture, season)
);

create index photos_pref_season_idx on public.photos (prefecture, season) where not is_hidden;

-- リアクション（登録不要・匿名トークンで重複防止）
create table public.reactions (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references public.stories(id) on delete cascade,
  type       text not null check (type in ('like','met')),
  anon_token text not null,
  created_at timestamptz not null default now(),
  unique (story_id, type, anon_token)
);

create index reactions_story_idx on public.reactions (story_id, type);

-- 報告（要ログイン）
create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('story','photo')),
  target_id   uuid not null,
  reporter_id uuid not null references public.users(id) on delete cascade,
  reason      text not null check (reason in ('personal_info','face','harmful','other')),
  detail      text,
  status      text not null default 'open' check (status in ('open','resolved','dismissed')),
  created_at  timestamptz not null default now()
);

-- 閲覧数インクリメント用 RPC
create or replace function public.increment_views(p_story_id uuid)
returns void
language sql
security definer
as $$
  update public.stories set views = views + 1 where id = p_story_id;
$$;

-- RLS: すべて有効化し公開ポリシーは作らない
-- （anon キーでのアクセスは全拒否。API は service_role 経由のみ）
alter table public.users     enable row level security;
alter table public.stories   enable row level security;
alter table public.photos    enable row level security;
alter table public.reactions enable row level security;
alter table public.reports   enable row level security;

-- Storage: ダッシュボードで public バケット "photos" を作成すること

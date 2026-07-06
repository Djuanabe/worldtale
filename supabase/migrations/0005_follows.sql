-- 見守る（フォロー）機能
-- follower_id が following_id を「見守る」。フォロー/フォロワー数は本人のみ閲覧する。

create table public.follows (
  follower_id  uuid not null references public.users(id) on delete cascade,
  following_id uuid not null references public.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

-- 「〜人に見守られ中」の集計用（following_id で引く）
create index follows_following_idx on public.follows (following_id);

alter table public.follows enable row level security;

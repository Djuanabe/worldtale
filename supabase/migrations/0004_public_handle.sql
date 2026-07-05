-- 公開用ハンドルの導入
-- public_id はログインID（認証情報）なので他ユーザーには見せない。
-- 外部公開用の識別子として handle を追加し、既存ユーザーにはランダム値を割り当てる。

alter table public.users add column if not exists handle text;

update public.users
set handle = upper(substr(md5(random()::text || id::text), 1, 10))
where handle is null;

alter table public.users alter column handle set not null;

create unique index if not exists users_handle_unique on public.users (handle);

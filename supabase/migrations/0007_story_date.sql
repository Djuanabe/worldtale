-- 物語に任意の「日付」を追加する
-- 選択は自由（年フィールドとの整合チェックはしない）。検索・地図分類には使わず表示のみ。

alter table public.stories add column if not exists story_date date;

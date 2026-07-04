-- 物語も写真と同じく「1ユーザー × 1場所(都道府県) × 1季節 につき1つまで」に制限する
-- season が null の既存行(0002以前)は対象外

create unique index if not exists stories_user_pref_season_unique
  on public.stories (user_id, prefecture, season)
  where season is not null;

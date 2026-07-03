# WorldTale 設計書

## 1. 全体構成

```
[ブラウザ]
   │  HTTPS
   ▼
[Cloudflare Pages]  … web/  静的SPA (Vite + vanilla TS)
   │  fetch (CORS)
   ▼
[Cloudflare Workers] … api/  Hono (TypeScript) REST API
   │  service_role key (サーバー側のみ)
   ▼
[Supabase]
   ├─ Postgres … users / stories / photos / reactions / reports
   └─ Storage  … photos バケット（公開読み取り）
```

- フロントは API のベースURLだけを知る（`web/src/config.ts`）
- Supabase の鍵はすべて Worker の環境変数。ブラウザには一切渡さない
- RLS は有効化し、公開ポリシーなし（= anon キー経由のアクセスは全拒否。service_role のみ通る）

## 2. リポジトリ構成

```
worldtale/
├─ docs/            要件定義・設計書（本書）
├─ supabase/
│   └─ migrations/0001_init.sql
├─ api/             Cloudflare Worker (Hono + TypeScript)
│   ├─ src/
│   ├─ wrangler.toml
│   └─ package.json
└─ web/             Cloudflare Pages (Vite + vanilla TypeScript SPA)
    ├─ src/
    ├─ public/_redirects   ( /* /index.html 200 )
    └─ package.json
```

## 3. データベーススキーマ

`supabase/migrations/0001_init.sql` 参照。要点:

- **users**: `id uuid PK` / `public_id text UNIQUE`（ランダム10文字、ログインID） /
  `username text`（表示名） / `password_hash text` / `created_at`
- **stories**: `id uuid PK` / `user_id FK` / `prefecture int (1..47, JIS X 0401)` /
  `year int` / `title text` / `body text` / `views bigint default 0` /
  `is_hidden boolean default false` / `created_at` / `updated_at`
- **photos**: `id uuid PK` / `user_id FK` / `story_id FK nullable` /
  `prefecture int` / `season text ('spring'|'summer'|'autumn'|'winter')` /
  `storage_path text` / `is_hidden boolean` / `created_at` /
  **UNIQUE(user_id, prefecture, season)** ← 1ユーザー1場所1季節1枚の制約
- **reactions**: `id uuid PK` / `story_id FK` / `type ('like'|'met')` /
  `anon_token text` / `created_at` / **UNIQUE(story_id, type, anon_token)**
- **reports**: `id uuid PK` / `target_type ('story'|'photo')` / `target_id uuid` /
  `reporter_id FK users` / `reason text` / `detail text` / `status text default 'open'` / `created_at`

閲覧数は `stories.views` を RPC `increment_views(story_id)` でインクリメント。

## 4. 認証設計（メール不使用）

- **登録**: `username` + `password` を受け取り、サーバーが `public_id`
  （Crockford Base32 風の英数10文字、紛らわしい文字 I/L/O/U を除く）を生成して返す。
- **ログイン**: `public_id` + `password`。
- **パスワードハッシュ**: WebCrypto PBKDF2-SHA256、210,000 iterations、16byte salt。
  保存形式 `pbkdf2$<iter>$<salt_b64>$<hash_b64>`。
- **セッション**: `hono/jwt` の HS256 JWT（`sub` = users.id, 有効期限30日）。
  フロントは localStorage に保存し `Authorization: Bearer` で送る。
- パスワードは8文字以上。ユーザー名は1〜30文字。

## 5. API 仕様（Worker / Hono）

ベースパス `/api`。レスポンスは JSON。エラーは `{ "error": { "code": string, "message": string } }` と適切な HTTP ステータス。
CORS は Pages のオリジンを許可（環境変数 `ALLOWED_ORIGIN`、未設定時 `*`）。

### 認証
| Method | Path | Auth | 説明 |
|---|---|---|---|
| POST | /api/auth/register | - | `{username, password}` → `201 {user:{publicId,username}, token}` |
| POST | /api/auth/login | - | `{publicId, password}` → `{user, token}` |
| GET | /api/auth/me | ✔ | `{user:{publicId, username}}` |

### 物語
| Method | Path | Auth | 説明 |
|---|---|---|---|
| GET | /api/stories | - | クエリ: `prefecture`, `year`, `userId`(publicId), `page`(1〜), `limit`(既定20, 最大50)。`{stories:[概要], total, page}`。概要 = `{id, title, excerpt(120字), prefecture, year, username, userPublicId, createdAt, likeCount, metCount}`。is_hidden は除外。新しい順 |
| GET | /api/stories/:id | - | 本文込みの全体 + `likeCount, metCount` + 添付写真 `{id,url,season}`。**呼ばれるたび views をインクリメント** |
| POST | /api/stories | ✔ | `{title, body, prefecture, year}` → 201。バリデーション: title 1..100, body 1..20000, prefecture 1..47, year 1900..今年 |
| PUT | /api/stories/:id | ✔ 本人 | 同上の部分更新 |
| DELETE | /api/stories/:id | ✔ 本人 | 添付写真もStorageごと削除 |
| GET | /api/stories/:id/stats | ✔ 本人 | `{views, likeCount, metCount}` |
| GET | /api/my/stories | ✔ | 自分の物語一覧（stats 込み、hidden含む） |

### リアクション（登録不要）
| Method | Path | Auth | 説明 |
|---|---|---|---|
| POST | /api/stories/:id/reactions | - | `{type:'like'|'met', anonToken}`。既存なら削除（トグル）。→ `{likeCount, metCount, reacted:{like:boolean, met:boolean}}` |
| GET | /api/stories/:id/reactions?anonToken= | - | 現在のカウントと自分の状態 |

anonToken はフロントが `crypto.randomUUID()` で生成し localStorage に永続化。

### ユーザー
| Method | Path | Auth | 説明 |
|---|---|---|---|
| GET | /api/users/:publicId | - | `{publicId, username, storyCount}`（物語は GET /api/stories?userId= で取得） |

### 写真
| Method | Path | Auth | 説明 |
|---|---|---|---|
| POST | /api/photos | ✔ | multipart/form-data: `file`, `prefecture`, `season`, `storyId`(任意)。5MBまで、image/jpeg,png,webp のみ。ユニーク制約違反は 409 `{error:{code:"PHOTO_SLOT_TAKEN"}}` → 201 `{id, url, prefecture, season}` |
| GET | /api/photos | - | クエリ `prefecture`(必須), `season`(任意) → `{photos:[{id,url,season,username}]}`（背景スライドショー用、hidden除外、最大30枚） |
| GET | /api/my/photos | ✔ | 自分の写真一覧 |
| DELETE | /api/photos/:id | ✔ 本人 | Storage からも削除 |

Storage: バケット `photos`（public）。パスは `{userId}/{prefecture}-{season}-{uuid}.{ext}`。
URL は `${SUPABASE_URL}/storage/v1/object/public/photos/{path}`。

### 報告・マップ
| Method | Path | Auth | 説明 |
|---|---|---|---|
| POST | /api/reports | ✔ | `{targetType:'story'|'photo', targetId, reason:'personal_info'|'face'|'harmful'|'other', detail?}` → 201 |
| GET | /api/map/summary | - | クエリ `year`(任意) → `{counts: {"1": 12, "13": 340, ...}}`（都道府県コード→物語数、hidden除外） |
| GET | /api/health | - | `{ok:true}` |

### Worker 環境変数
`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `JWT_SECRET` / `ALLOWED_ORIGIN`
（wrangler.toml には名前だけ記載し、値は `wrangler secret put` で設定）

## 6. フロントエンド設計（web/）

Vite + vanilla TypeScript の SPA。History API ルーティング + `public/_redirects` に `/* /index.html 200`。
フレームワークは使わない（無料・軽量・保守簡単のため）。

### ルート
| Path | 画面 |
|---|---|
| `/` | トップ: コンセプト文 + 日本地図（タイル型、47都道府県）。年セレクタ。物語数で濃淡 |
| `/p/:pref` | 都道府県ページ: `?year=` で絞り込み。物語一覧 + **背景に写真スライドショー**（season タブ: 春/夏/秋/冬/すべて） |
| `/story/:id` | 物語ページ: 本文、いいね/出会ってたかもボタン、共有ボタン2種、報告ボタン |
| `/u/:publicId` | ユーザーページ: その人の物語を年順に辿るタイムライン |
| `/search` | 検索: 都道府県 × 年で探す |
| `/write` | 投稿フォーム（要ログイン）: 注意事項の同意チェック必須 + 写真アップロード |
| `/login`, `/register` | 認証。登録完了時にユーザーIDを大きく表示し「控えてください」と警告 |
| `/me` | マイページ: 自分の物語一覧と閲覧数・リアクション数、写真管理 |

### 日本地図
外部アセットに依存しない**タイル型（グリッド配置）マップ**を自前実装する。
47都道府県を CSS Grid 上に日本列島の形に配置（北海道は右上、沖縄は左下、の定番タイルレイアウト）。
各タイルに都道府県名（漢字）を表示。データは `src/prefectures.ts` にコード・名前・grid座標を定義。

### 背景スライドショー
都道府県ページで `GET /api/photos?prefecture=` の写真を背景レイヤーに表示し、
8秒ごとにクロスフェードで切り替え。手前に半透明の紙色レイヤーを重ねて本文の可読性を保つ。

### SNS共有（物語ページ）
1. 「私の物語として共有」: テキスト `「{title}」 — わたしの物語 #WorldTale` + URL `{origin}/story/{id}`
2. 「そっと共有」: テキスト `世界のどこかに私の物語を追加しました #WorldTale` + URL `{origin}/`（トップのみ。物語へのリンクは含めない）

いずれも X intent (`https://twitter.com/intent/tweet?text=...&url=...`) と、
`navigator.share` が使える端末では Web Share API も提供。

### デザインガイド（穏やか・クラシック）
- フォント: 見出し・本文とも明朝系。Google Fonts「Shippori Mincho」+ フォールバック `"Hiragino Mincho ProN", serif`
- 配色:
  - 背景: 生成り `#f6f1e7` / 紙面カード `#fffdf7`
  - 文字: 墨色 `#3a3226`
  - アクセント: 深緑 `#5b6e4f`（リンク・ボタン）、臙脂 `#8e354a`（いいね等の強調）
  - 罫線: `#d8cfbc` の細線
- 質感: 影は最小限、角丸は 2〜4px 程度、余白を広く。装飾は罫線と中黒・飾り罫程度
- リアクションボタン: 「♡ いいね」「⛩ 出会ってたかも」のような控えめな和風トーン
- レスポンシブ対応（スマホ幅でマップは縮小グリッド）

### config
`web/src/config.ts` に `export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";`

## 7. デプロイ（無料枠）

1. **Supabase**: プロジェクト作成 → SQL Editor で `0001_init.sql` 実行 → Storage に `photos` バケット（public）作成
2. **API**: `cd api && npm i && npx wrangler secret put ...(4つ) && npx wrangler deploy`
3. **Web**: Cloudflare Pages で `web/` をビルド（`npm run build`, 出力 `dist`、環境変数 `VITE_API_BASE`）
4. GitHub Student Pack: Namecheap 等の無料ドメインを Pages/Workers に割り当て可能（任意）

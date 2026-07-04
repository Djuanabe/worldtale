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
| `/p/:pref` | 都道府県ページ: **「道ゆく人」シーン**（下記 6.1）。`?year=` で絞り込み |
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

### 6.1 都道府県ページ「道ゆく人」シーン

その土地の道を一人称視点で歩いているような全画面シーン。物語は一覧では見せず、
**ランダム性を重視**して「道ゆく人」との偶然の出会いとして提示する。

- **シーン**: ヘッダー下いっぱいに、消失点へ延びる道（遠近感のある台形）、両脇の野原、空を描く。
  外部アセット不使用。見た目はデザインガイドの**レトロRPGフィールド調**で、
  べた塗りバンドではなく**ピクセル単位のドット絵**として描く:
  低解像度（例: 横320px程度）のオフスクリーン canvas にドット絵を描画し、
  `image-rendering: pixelated` で拡大表示する。色バンドの境目はディザリング（市松パターン）でなじませ、
  草原には草むらのドット、道には小石・轍のドット、山には陰影のディザ、雲・太陽もドット絵で描く。
- **アバター**: **白塗りのドット絵スプライト**（白〜明るいグレー数階調 + 暗い輪郭線。
  服・髪も含め全身白系で、誰でもない「まっしろな旅人」として描く）。
  解像度は 16×24 ドット以上（8bit風→16bit風に精細化）、歩行アニメは2〜4フレーム。
  その都道府県（+年フィルタ）の物語からランダムに選ばれた1件を1体が担う。
  同時に3〜8体が**道の上に限らず野原も含めた**ランダムな奥行き・位置を歩く。
  出入りはフェードではなく**画面外から歩いて入ってきて、画面外へ歩き去る**
  （寿命15〜40秒のランダムで退場を開始し、消えたら別のランダムな物語の新しいヒトが入場する）。
- **ふきだし**: 各アバターは不定期にふきだしで物語タイトルを数秒間だけ表示し、また隠す
  （出現タイミング・表示時間はランダム）。
- **ズーム閲覧**: ヒトをクリックすると**ページ遷移せず**、そのヒトへ寄っていくズーム演出の後、
  読書モードのオーバーレイになる。
  - 物語に写真があれば、その写真を全面背景（薄暗く+紙色の半透明レイヤー）にする
  - 本文は空行・改行で分割したチャンクを**ふきだしベース**で順に表示（タップ/クリックで次へ、
    古いふきだしは薄れて上へ流れる）
  - 末尾にリアクション2種・共有2種・報告・「しおりページで読む」（/story/:id への通常リンク）
  - ✕ボタン / Esc / ブラウザバックで道のシーンへ戻る（history.pushState で `?story=` を管理）
  - 読書モード開始時に GET /api/stories/:id を呼ぶため閲覧数は通常どおり加算される
- 年セレクタはシーンの隅に控えめに置く。季節タブと一覧・ページネーションは廃止
  （/story/:id の通常ページは共有リンクの着地先として残す）。

### SNS共有
1. 「私の物語として共有」: テキスト `「{title}」 — わたしの物語 #WorldTale` + URL `{origin}/story/{id}`。
   **マイページ（/me）の自分の物語それぞれにのみ**設置する。閲覧画面（/story/:id・読書モード）には出さない。
2. 「そっと共有」: テキスト `世界のどこかに私の物語を追加しました #WorldTale` + URL `{origin}/`（トップのみ。物語へのリンクは含めない）。
   **閲覧画面（/story/:id・読書モード）とマイページの両方**に設置する。

いずれも X intent (`https://twitter.com/intent/tweet?text=...&url=...`) と、
`navigator.share` が使える端末では Web Share API も提供。

### デザインガイド（レトロRPG風・ドット絵調）

昔のRPG（スーパーファミコン〜N64期のJRPG）の画面のような雰囲気。
ただしトーンは穏やかに保つ（どぎつい原色は避け、牧歌的で少し色あせたフィールドの色合い）。

- フォント: Google Fonts「DotGothic16」（日本語ドットフォント）+ フォールバック `monospace`
- 配色:
  - フィールド: 空 `#a8d8e8`（淡い水色）、草原 `#88b06a`、土の道 `#c8a86a`、山 `#7a8a9a`
  - **メッセージウィンドウ**: 紺 `#20204a` 地 + 白 `#f8f8f0` 文字 + 白の二重枠
    （`border: 3px solid #f8f8f0; box-shadow: 0 0 0 3px #20204a, 0 0 0 5px #f8f8f0` 等で表現）
  - アクセント: 金 `#e8c860`（選択カーソル・強調）、HP緑 `#70c878`、ダメージ赤 `#d86060`
- UI 部品:
  - ふきだし・本文表示・カード類はすべて**RPGのメッセージウィンドウ**スタイル（角丸なし・二重枠・紺地白文字）
  - 文末に ▼ の点滅インジケータ（「つづきがある」合図）
  - ボタンはウィンドウ風 + hover/focus で ▶ カーソル表示、押下で 1px 沈む
  - 見出し・タイトルは白文字 + ドロップシャドウ（1px 黒ずらし）でゲームタイトル調
- ドット感: `image-rendering: pixelated` を画像に適用。角丸・ぼかし影は使わない。
  境界は 2〜4px のくっきりした枠線。背景・大きな面はべた塗りではなく
  **ピクセル単位のテクスチャ**（ディザリング・草むら・小石などのドット）を入れる
- アバター/スプライト: **白塗り**のドット絵ヒト型スプライト
  （白〜明るいグレー数階調 + 暗い輪郭線。16×24 ドット以上、歩行2〜4フレーム）
- トップの日本地図タイルもドット調（ベベル枠のタイル、選択時に ▶ カーソル）
- レスポンシブ対応（スマホ幅でマップは縮小グリッド）

### config
`web/src/config.ts` に `export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8787";`

## 7. デプロイ（無料枠）

1. **Supabase**: プロジェクト作成 → SQL Editor で `0001_init.sql` 実行 → Storage に `photos` バケット（public）作成
2. **API**: `cd api && npm i && npx wrangler secret put ...(4つ) && npx wrangler deploy`
3. **Web**: Cloudflare Pages で `web/` をビルド（`npm run build`, 出力 `dist`、環境変数 `VITE_API_BASE`）
4. GitHub Student Pack: Namecheap 等の無料ドメインを Pages/Workers に割り当て可能（任意）

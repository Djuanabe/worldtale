# WorldTale API (Cloudflare Workers + Hono)

WorldTale のバックエンド REST API です。Cloudflare Workers 上で Hono を使って動作し、
Supabase（Postgres + Storage）に service_role キーで接続します。

## 必要なもの

- Node.js 18 以上
- Cloudflare アカウント（`wrangler`）
- Supabase プロジェクト（`supabase/migrations/0001_init.sql` を適用済み、`photos` バケットを public で作成済み）

## セットアップ

```bash
cd api
npm install
```

### ローカル開発

`.dev.vars.example` を `.dev.vars` にコピーして値を埋めます（`.dev.vars` は git 管理外）。

```bash
cp .dev.vars.example .dev.vars
# エディタで SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / JWT_SECRET / ALLOWED_ORIGIN を設定
npm run dev        # wrangler dev（既定 http://localhost:8787）
```

### 型チェック

```bash
npm run typecheck  # tsc --noEmit
```

## デプロイ

シークレット4つを登録してからデプロイします（値はコミットしないこと）。

```bash
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put JWT_SECRET
npx wrangler secret put ALLOWED_ORIGIN
npm run deploy     # wrangler deploy
```

## 環境変数

| 名前 | 説明 |
|---|---|
| `SUPABASE_URL` | Supabase プロジェクト URL（末尾スラッシュなし） |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role キー（サーバー側のみ・絶対に公開しない） |
| `JWT_SECRET` | セッション JWT(HS256) の署名鍵 |
| `ALLOWED_ORIGIN` | CORS 許可オリジン（未設定時は `*`） |

## 認証

- 登録: `username` + `password`（8文字以上）→ サーバーが `public_id`（英数10文字）を発行して返す
- ログイン: `public_id` + `password`
- パスワード: PBKDF2-SHA256 / 210,000 iterations / 16byte salt、保存形式 `pbkdf2$<iter>$<salt_b64>$<hash_b64>`
- セッション: HS256 JWT（`sub` = users.id、有効期限30日）。`Authorization: Bearer <token>` で送る

## エンドポイント一覧（ベースパス `/api`）

| Method | Path | Auth |
|---|---|---|
| POST | /auth/register | - |
| POST | /auth/login | - |
| GET | /auth/me | ✔ |
| GET | /stories | - |
| GET | /stories/:id | - |
| POST | /stories | ✔ |
| PUT | /stories/:id | ✔ 本人 |
| DELETE | /stories/:id | ✔ 本人 |
| GET | /stories/:id/stats | ✔ 本人 |
| POST | /stories/:id/reactions | - |
| GET | /stories/:id/reactions | - |
| GET | /my/stories | ✔ |
| GET | /my/photos | ✔ |
| GET | /users/:publicId | - |
| POST | /photos | ✔ |
| GET | /photos | - |
| DELETE | /photos/:id | ✔ 本人 |
| POST | /reports | ✔ |
| GET | /map/summary | - |
| GET | /health | - |

エラーは `{ "error": { "code": string, "message": string } }` の形式で、適切な HTTP ステータスとともに返します。

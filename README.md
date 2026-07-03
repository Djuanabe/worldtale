# WorldTale — 世界はたくさんの物語でできている

自分の体験を日記のように書き起こし、「場所 × 時」に紐づけて世界に残すソーシャルサイト。
誰かの過ごした時間と場所を、別の誰かが辿って読むことができます。

- 物語は **都道府県 × 年** に紐づく（プロトタイプ。将来は市区町村 × 季節へ）
- 読者のリアクションは **「いいね」** と **「出会ってたかも」** の2種類のみ（登録不要）
- 物語に添えて、その土地・その季節の **風景写真** を1ユーザー1場所1季節につき1枚アップロードでき、
  その場所のページの背景スライドショーになる
- アカウントは **ユーザー名・ランダム発行のユーザーID・パスワードのみ**（メール不使用）

## 構成

| ディレクトリ | 内容 | デプロイ先 |
|---|---|---|
| `docs/` | 要件定義書・設計書 | — |
| `supabase/` | DB マイグレーション SQL | Supabase (Free) |
| `api/` | REST API (Hono + TypeScript) | Cloudflare Workers (Free) |
| `web/` | SPA (Vite + vanilla TypeScript) | Cloudflare Pages (Free) |

すべて無料枠で運用できます。詳細は [docs/requirements.md](docs/requirements.md) と
[docs/architecture.md](docs/architecture.md) を参照してください。

## セットアップ手順（概要）

1. **Supabase**: プロジェクトを作成し、SQL Editor で
   `supabase/migrations/0001_init.sql` を実行。
   Storage で **public バケット `photos`** を作成。
2. **API**: `api/README.md` の手順でシークレットを設定し `wrangler deploy`。
3. **Web**: Cloudflare Pages にリポジトリを接続し、ルート `web/`、
   ビルドコマンド `npm run build`、出力 `dist`、
   環境変数 `VITE_API_BASE` に Workers の URL を設定。

## ローカル開発

```bash
# API (http://localhost:8787)
cd api && npm i && cp .dev.vars.example .dev.vars  # 値を記入
npm run dev

# Web (http://localhost:5173)
cd web && npm i && npm run dev
```

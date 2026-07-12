# WorldTale — 世界はたくさんの物語でできている

**▶ サイトを見る: https://worldtale.comus.jp** （日本国内のみ対応）

<!-- ![WorldTaleのマップ](docs/screenshot.png) -->

自分の体験を日記のように書き起こし、「場所 × 時」に紐づけて世界に残すソーシャルサイト。
誰かの過ごした時間と場所を、別の誰かが辿って読むことができます。

## 特徴

- 🗺 **ドット絵のレトロRPG風・日本地図**。物語が集まった土地ほど色が濃くなる。地方 → 都道府県の2段階で読みにいく
- 🤝 **「いいね」と「出会ってたかも」** ——同じ時期・同じ場所にいたかもしれない見知らぬ誰かに、そっと反応できる
- 🎁 **タイムカプセル**。地図の海に浮かぶカプセルを開けると、どこかの誰かの物語がランダムで届く
- 📷 **風景写真**。その土地・その季節の写真が、場所ページの背景スライドショーになる
- 🔓 **読む・リアクションは登録不要**。アカウントもメール不要（ユーザー名 + パスワードのみ、実名・住所なし）

物語は **都道府県 × 年** に紐づきます（プロトタイプ。将来は市区町村 × 季節へ細分化予定）。

## 構成

| ディレクトリ | 内容 | デプロイ先 |
| --- | --- | --- |
| `docs/` | 要件定義書・設計書 | — |
| `supabase/` | DB マイグレーション SQL | Supabase |
| `api/` | REST API (Hono + TypeScript) | Cloudflare Workers |
| `web/` | SPA (Vite + vanilla TypeScript) | Cloudflare Pages |

詳細は [docs/requirements.md](docs/requirements.md) と [docs/architecture.md](docs/architecture.md) を参照してください。

## ローカル開発

```bash
# API (http://localhost:8787)
cd api && npm i && cp .dev.vars.example .dev.vars  # 値を記入
npm run dev

# Web (http://localhost:5173)
cd web && npm i && npm run dev
```

### Supabase なしで画面を確認する（モックAPI）

Supabase を用意しなくても、シードデータ入りのモックAPIでサイト全体を動かせます。

```bash
# ターミナル1: モックAPI (http://localhost:8787, Node 18+ のみで動作)
node tools/mock-api.mjs

# ターミナル2: フロントエンド
cd web && npm i && npm run dev
# → http://localhost:5173 を開く
```

デモアカウント: ユーザーID `DEMO123456` / パスワード `password123`

## デプロイ

本番デプロイ（Supabase + Cloudflare Workers + Pages）の手順は [docs/deploy.md](docs/deploy.md) を参照してください。

## ライセンス

MIT License（`LICENSE` ファイルを追加してください）

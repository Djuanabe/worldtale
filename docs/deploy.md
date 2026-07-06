# WorldTale デプロイ手順（無料枠）

Supabase（DB・ストレージ）＋ Cloudflare Workers（API）＋ Cloudflare Pages（Web）に
すべて無料枠でデプロイする手順です。あなたのアカウントと認証情報が必要です。

所要時間の目安: 30〜45分。

> 依存の順序: **API を先にデプロイ**して URL を得る → その URL で **Web をビルド/デプロイ** →
> Web の URL を **API の `ALLOWED_ORIGIN`** に設定して API を再デプロイ、という順で進めます。

### 本番の確定値（この構成で進める）

| 項目 | 値 |
|---|---|
| ドメイン（ゾーン） | `comus.jp`（Cloudflare にネームサーバーを移す） |
| サイト本体（Pages） | `worldtale.comus.jp` |
| API（Workers） | `worldtale-api.comus.jp` |
| Web の `VITE_API_BASE` | `https://worldtale-api.comus.jp` |
| API の `ALLOWED_ORIGIN` | `https://worldtale.comus.jp` |

以下の手順中 `example.com` 等の表記が出たら、上表の値に読み替えてください。
ドメイン割り当ての詳細は「4.5 独自ドメイン」を参照。

---

## 1. Supabase（DB・ストレージ）

1. https://supabase.com でプロジェクトを作成（Region は `Tokyo (ap-northeast-1)` 推奨）。
2. **SQL Editor** を開き、`supabase/migrations/` の SQL を**番号順に**貼り付けて実行:
   - `0001_init.sql`
   - `0002_season_municipality.sql`
   - `0003_story_slot_unique.sql`
   - `0004_public_handle.sql`
   （4つを続けて貼り付けて一度に実行してもよい）
3. **Storage** → **New bucket** で以下を作成:
   - 名前: `photos`
   - **Public bucket: ON**（公開読み取り）
4. 写真を道シーンの背景合成に使うため、Storage の **CORS** で任意オリジンからの取得を許可
   （Supabase の public オブジェクトは既定で `Access-Control-Allow-Origin: *` を返すため、
   通常は追加設定不要。もし道シーンの背景に写真が出ない場合はここを確認）。
5. **Project Settings → API** から次の2つを控える:
   - `Project URL`（例 `https://xxxx.supabase.co`）→ 後の `SUPABASE_URL`
   - `service_role` キー（**秘密**。絶対に公開・コミットしない）→ 後の `SUPABASE_SERVICE_ROLE_KEY`

---

## 2. API（Cloudflare Workers）

```bash
cd api
npm install
npx wrangler login        # ブラウザで Cloudflare にログイン

# シークレットを登録（プロンプトに値を貼り付け）
npx wrangler secret put SUPABASE_URL                # 例 https://xxxx.supabase.co
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # Supabase の service_role キー
npx wrangler secret put JWT_SECRET                  # 下記コマンドで生成した長い乱数
npx wrangler secret put ALLOWED_ORIGIN              # 一旦 * を入れておく（後で Web の URL に更新）

npm run deploy
```

- `JWT_SECRET` の生成例: `openssl rand -base64 48`
- デプロイ後に表示される URL（例 `https://worldtale-api.<account>.workers.dev`）を控える → Web の `VITE_API_BASE`。
- 動作確認: `curl https://worldtale-api.<account>.workers.dev/api/health` → `{"ok":true}`

---

## 3. Web（Cloudflare Pages）

**方法A: ダッシュボードで Git 連携（推奨・自動デプロイ）**

1. Cloudflare **Pages** → **Create a project** → GitHub の `worldtale` リポジトリを接続。
2. ビルド設定:
   - Framework preset: `None`
   - **Root directory**: `web`
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Environment variables**: `VITE_API_BASE` = 手順2で控えた Workers の URL
     （末尾スラッシュなし。例 `https://worldtale-api.xxx.workers.dev`）
3. デプロイ完了後の URL（例 `https://worldtale.pages.dev`）を控える。

**方法B: CLI で手動デプロイ**

```bash
cd web
npm install
VITE_API_BASE="https://worldtale-api.xxx.workers.dev" npm run build
npx wrangler pages deploy dist --project-name worldtale
```

---

## 4. CORS を締める（API の再デプロイ）

Web の URL が決まったら、API の許可オリジンをそのドメインに限定します。

```bash
cd api
npx wrangler secret put ALLOWED_ORIGIN   # 例 https://worldtale.pages.dev（末尾スラッシュなし）
npm run deploy
```

- 独自ドメインを Pages に割り当てた場合は、そのドメインを `ALLOWED_ORIGIN` に設定。
- 複数オリジンを許可したい場合はカンマ区切りには未対応のため、当面は本番ドメイン1つに絞るのが安全。

---

## 4.5 独自ドメイン（`comus.jp` のサブドメインを使う）

構成: **本体 = `worldtale.comus.jp` ／ API = `worldtale-api.comus.jp`**。
サブドメインだけを使う場合でも、API（Workers）のカスタムドメインには
**ゾーン `comus.jp` を Cloudflare で管理している必要がある**ため、
ネームサーバーごと Cloudflare に移すのが最も確実です。

> ⚠️ 事前確認: `comus.jp` を**メールや他サイトで既に使っている**場合、
> ネームサーバーを移すとそれらの DNS レコードが引き継がれません。
> 手順1の途中で Cloudflare が既存レコードをスキャンするので、
> **既存の MX・A・CNAME・TXT レコードが Cloudflare 側に取り込まれているか必ず確認**し、
> 足りなければ手動で追加してから NS を切り替えてください。
> `comus.jp` が未使用（このサイト専用）なら、そのまま進めて問題ありません。

### 手順1: ネームサーバーを Cloudflare に向ける（一度だけ）

1. Cloudflare ダッシュボード → **Add a site** → `comus.jp` を入力 → Free プランを選択。
2. Cloudflare が既存DNSをスキャン → 取り込まれたレコードを確認（上の事前確認を参照）。
3. **2つのネームサーバー**（例 `xxx.ns.cloudflare.com` / `yyy.ns.cloudflare.com`）が提示される。
4. **お名前.com** → 「ネームサーバーの設定」→ `comus.jp` → 「他社ネームサーバーを利用」を選び、
   上記2つを登録して保存。
5. 反映まで数分〜最大24時間。Cloudflare 側で `comus.jp` が `Active` になれば完了。

### 手順2: Web（Pages）に worldtale.comus.jp を割り当て

1. Cloudflare **Pages** → プロジェクト `worldtale` → **Custom domains** → **Set up a domain**。
2. `worldtale.comus.jp` を追加。
   - Pages が CNAME レコードを自動作成、SSL証明書も自動発行。
   - 反映後 `https://worldtale.comus.jp` でサイトが開く。

### 手順3: API（Workers）に worldtale-api.comus.jp を割り当て

1. Cloudflare **Workers & Pages** → `worldtale-api` → **Settings → Domains & Routes** →
   **Add → Custom Domain** → `worldtale-api.comus.jp` を追加（DNSレコードとSSLは自動）。
2. `https://worldtale-api.comus.jp/api/health` → `{"ok":true}` を確認。

### 手順4: 設定値をドメインに更新して再デプロイ

- **Web**: Pages の環境変数 `VITE_API_BASE` = `https://worldtale-api.comus.jp` に設定 → 再デプロイ
  （Deployments → Retry deployment、または再push）。
- **API**: 許可オリジンを本体ドメインに限定:
  ```bash
  cd api
  npx wrangler secret put ALLOWED_ORIGIN   # https://worldtale.comus.jp
  npm run deploy
  ```

> メールは使わないサービスなので、このサイトのためのメール（MX）設定は不要です
> （`comus.jp` を既にメールで使っている場合は、手順1で既存 MX を引き継ぐこと）。

---

## 5. 動作確認

1. `https://worldtale.pages.dev` を開き、日本地図が表示される。
2. 「はじめる」からユーザー登録 → **表示されたユーザーID（ログインID）を控える**。
3. 「書く」から物語を投稿（都道府県・市区町村・年・季節・任意で写真）。
4. 地図で地方→都道府県を選び、道シーンで自分のアバターが現れる。クリックして読める。
5. リアクション・共有・タイムカプセルを確認。

---

## 無料枠の目安と注意

- **Cloudflare Workers**: 10万リクエスト/日、**Pages**: 無制限帯域・月500ビルド。
- **Supabase Free**: Postgres 500MB / Storage 1GB / 帯域 5GB・月（十分だが写真枚数に注意）。
- **GitHub Student Developer Pack**: Namecheap 等で無料ドメインを取得し、Pages/Workers に割り当て可能。
- パスワードリセット手段は無い（メール不使用）。ユーザーIDは再発行不可なので登録時の控えが重要。
- 有害コンテンツは Supabase ダッシュボードで対象行の `is_hidden` を `true` にすると非表示化できる
  （プロトタイプでは専用の管理画面は未実装）。

---

## トラブルシューティング

- **Web から API にアクセスできない/CORSエラー**: `ALLOWED_ORIGIN` が Web の URL と完全一致しているか
  （`https`・末尾スラッシュ有無）。`*` に戻すと切り分けできる。
- **写真がアップロードできない**: Storage に public バケット `photos` があるか、service_role キーが正しいか。
- **道シーンの背景に写真が出ない**: Storage の CORS（`Access-Control-Allow-Origin`）。出なくても
  山の背景にフォールバックするので致命的ではない。
- **`wrangler deploy` が型で失敗**: `cd api && npm run typecheck` でエラーを確認。

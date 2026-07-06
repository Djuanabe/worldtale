# WorldTale デプロイ手順（無料枠）

Supabase（DB・ストレージ）＋ Cloudflare Workers（API）＋ Cloudflare Pages（Web）に
すべて無料枠でデプロイする手順です。あなたのアカウントと認証情報が必要です。

所要時間の目安: 30〜45分。

> 依存の順序: **API を先にデプロイ**して URL を得る → その URL で **Web をビルド/デプロイ** →
> Web の URL を **API の `ALLOWED_ORIGIN`** に設定して API を再デプロイ、という順で進めます。

### 本番の確定値（この構成で進める）

`comus.jp` は**既にメール等で使用中**のため、ネームサーバーは移さず、
**サイト本体だけをサブドメインの CNAME で Cloudflare に向ける**構成にする（既存のメール・他サイトに影響なし）。
API はカスタムドメインを付けず、Cloudflare 既定の `*.workers.dev` URL のまま使う
（API の URL はブラウザの通信先として使うだけで、利用者が直接目にする画面URLは本体ドメイン）。

| 項目 | 値 |
|---|---|
| サイト本体（Pages） | `worldtale.comus.jp`（お名前.com に CNAME を追加） |
| API（Workers） | `https://worldtale-api.<account>.workers.dev`（既定URL・移管不要） |
| Web の `VITE_API_BASE` | `https://worldtale-api.<account>.workers.dev`（手順2で判明する実URL） |
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
   - `0005_follows.sql`（見守る／フォロー機能）
   （続けて貼り付けて一度に実行してもよい。既に 0001〜0004 を適用済みなら
   `0005_follows.sql` だけ追加で実行すればよい）
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

## 4.5 独自ドメイン（`comus.jp` は使用中 → ネームサーバーは移さない）

`comus.jp` を既にメール・他サイトで使っているため、**ネームサーバーは移管しない**。
サイト本体だけを **CNAME でサブドメインを Cloudflare Pages に向ける**（既存DNSに影響なし）。
API はカスタムドメインを付けず、既定の `*.workers.dev` を使う
（Workers のカスタムドメインはゾーンを Cloudflare 管理下に置く必要があり、移管が前提になるため）。

> この方式なら、お名前.com の DNS はそのまま。**追加するのは CNAME 1本だけ**なので、
> 既存のメール（MX）や他サイトのレコードは一切触りません。

### 手順1: Web（Pages）を先にデプロイ

「3. Web（Cloudflare Pages）」の手順で Pages にデプロイし、`worldtale.pages.dev` を発行しておく
（`VITE_API_BASE` には手順2の API の workers.dev URL を入れる）。

### 手順2: Pages にカスタムドメインを追加（外部DNSモード）

1. Cloudflare **Pages** → プロジェクト `worldtale` → **Custom domains** → **Set up a domain**。
2. `worldtale.comus.jp` を入力。ゾーンが Cloudflare に無いので、
   Cloudflare は**追加すべき CNAME レコード**（ターゲット: `worldtale.pages.dev`）を表示する。
3. **お名前.com** の DNS 設定でそのレコードを追加:
   - タイプ: `CNAME`
   - ホスト名: `worldtale`（＝`worldtale.comus.jp`）
   - VALUE: `worldtale.pages.dev`
   - TTL: 既定でOK
4. 保存後、Cloudflare が CNAME を検知して SSL 証明書を自動発行（数分〜）。
   `Active` になれば `https://worldtale.comus.jp` でサイトが開く。

### 手順3: 設定値を更新

- **Web**: Pages の環境変数 `VITE_API_BASE` は API の workers.dev URL のまま
  （例 `https://worldtale-api.<account>.workers.dev`）。ドメイン化しないので変更不要。
- **API**: 許可オリジンを本体ドメインに限定して再デプロイ:
  ```bash
  cd api
  npx wrangler secret put ALLOWED_ORIGIN   # https://worldtale.comus.jp
  npm run deploy
  ```

> メール（MX）設定はこのサイトのためには不要。既存の `comus.jp` のメール設定は
> ネームサーバーを移さないのでそのまま有効です。

### （任意）将来 API も `worldtale-api.comus.jp` にしたい場合

Workers のカスタムドメインはゾーンを Cloudflare 管理下に置く必要があるため、
その時は `comus.jp` のネームサーバーを Cloudflare に移管する（無料）。
ただし移管前に、**お名前.com の既存レコード（MX・SPF/DKIM/DMARC の TXT・他サイトの A/CNAME）を
Cloudflare 側に漏れなく再登録**してから NS を切り替えること。未使用ドメインでない限り必須の注意点。

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

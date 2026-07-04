# WorldTale Web (フロントエンド)

Vite + vanilla TypeScript（フレームワーク不使用）による SPA です。
Cloudflare Pages にデプロイします。ルーティングは History API を使った自前の軽量ルーターです。

## ローカル開発

```bash
cd web
npm install
```

API のベースURLは `VITE_API_BASE` 環境変数で指定します（未設定時は `http://localhost:8787`）。
ローカルで `api/`（Cloudflare Worker）を別途起動している場合は `.env.local` を作成してください。

```bash
# web/.env.local
VITE_API_BASE=http://localhost:8787
```

開発サーバーを起動:

```bash
npm run dev
```

## ビルド

```bash
npm run build
```

`tsc` による型チェックのあと `vite build` が実行され、`dist/` に静的ファイルが出力されます。

ビルド結果をローカルで確認する場合:

```bash
npm run preview
```

## Cloudflare Pages へのデプロイ

1. Cloudflare Pages で新規プロジェクトを作成し、このリポジトリを接続する
2. **ビルド設定**
   - フレームワークプリセット: なし
   - ビルドコマンド: `npm run build`
   - ビルド出力ディレクトリ: `web/dist`（モノレポの場合は「ルートディレクトリ」を `web` に設定したうえで出力を `dist` とする）
3. **環境変数**
   - `VITE_API_BASE` に本番の API（Cloudflare Workers）のURLを設定する（例: `https://worldtale-api.example.workers.dev`）
4. `public/_redirects`（`/* /index.html 200`）により、SPA の全ルートが `index.html` にフォールバックされます
5. デプロイ後、API 側の `ALLOWED_ORIGIN` に Pages のオリジンを設定してください（CORS）

## 構成

- `src/main.ts` … ルーティングの初期化とルート定義
- `src/router.ts` … History API を使った軽量ルーター
- `src/api.ts` … API クライアント（JWT は `localStorage.wt_token`、匿名リアクショントークンは `localStorage.wt_anon`）
- `src/config.ts` … `VITE_API_BASE` の読み込み
- `src/prefectures.ts` … 47都道府県のコード・名称・タイル型地図のグリッド座標
- `src/ui.ts` … ヘッダー・フッター・モーダルなどの共有UI部品
- `src/pages/*.ts` … 画面ごとの実装
- `src/style.css` … 唯一のスタイルシート（レトロRPG風・ドット絵調デザイン。フォントは DotGothic16）

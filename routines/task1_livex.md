# Task1: Livex物件チェック

## 概要

Livex（ライベックス）のWebサイトから新規・更新物件を検出し、条件に合う物件があればメールとTelegramで通知する。
state/livex.jsonで既知の物件を管理し、差分のみ通知する。

## 使用する環境変数

- `$CRON_SECRET` — Vercel API認証
- `$EMAIL_ENDPOINT` — メール通知エンドポイント
- `$TELEGRAM_ENDPOINT` — Telegram通知エンドポイント

## 手順

### ステップ1: state/livex.jsonを読む

リポジトリ内の `state/livex.json` を読み込む。
既知の建物情報（ID、lastmod、通知済みフロアキー）が記録されている。

### ステップ2: Sitemapを取得

WebFetchで以下10件のSitemapを順に取得する：

- `https://www.livex-inc.com/search/detail/sitemap_0.xml`
- `https://www.livex-inc.com/search/detail/sitemap_1.xml`
- （同様にsitemap_2.xml ～ sitemap_9.xml）

各XMLから `<loc>` タグのURLと `<lastmod>` を抽出し、URLから物件IDを取得する。
例: `https://www.livex-inc.com/search/detail/facility_index.php?id=12345` → ID=12345

### ステップ3: 新規・更新ビルを特定

- state/livex.jsonに存在しないID → 新規ビル
- lastmodがstate内の値と異なる → 更新ビル
- **初回実行（state/livex.jsonが空）の場合は全ビルをstateに登録するだけで通知しない**

### ステップ4: 物件詳細を取得

各ビルの詳細ページをWebFetchで取得する（**1件ごとに2秒待機すること**）：
`https://www.livex-inc.com/search/detail/facility_index.php?id={ID}`

以下の情報を抽出する：
- 物件名: `<h1>` タグ
- 所在地: 「所在地」行のテーブルセル
- 各フロア情報: テーブルから「坪数/面積」「坪単価/賃料(坪)」「月額賃料」列

### ステップ5: フィルタリング

以下の**全条件を満たすフロア**のみ対象とする：

**エリア（住所に含まれるか）:**
大田区, 品川区, 世田谷区, 目黒区, 渋谷区, 中央区, 千代田区, 台東区, 港区,
鶴見区, 川崎区, 中原区, 高津区, 宮前区, 多摩区, 神奈川区, 港北区, 西区

**面積:** 65坪以上120坪以下

**坪単価:** 10,000円以下

### ステップ6: 新着物件があればメールを送信

```bash
curl -s -X POST "$EMAIL_ENDPOINT" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"subject":"【新着物件】Livex N件 (YYYY-MM-DD)","properties":[{"name":"物件名","url":"URL","area":"エリア","address":"住所","tsubo":"坪数","price_per_tsubo":"坪単価","monthly_rent":"月額賃料"},...]}'
```

### ステップ7: Telegram通知

```bash
# 新着あり
curl -s -X POST "$TELEGRAM_ENDPOINT" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"text":"🏢 *Livex物件チェック完了*\n新着 N件を検出しメール送信しました。"}'

# 新着なし
curl -s -X POST "$TELEGRAM_ENDPOINT" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"text":"🏢 *Livex物件チェック完了*\n本日の新着物件はありませんでした。"}'
```

### ステップ8: state/livex.jsonを更新してコミット

処理した全ビルのlastmodと通知済みフロアキー（"坪数|坪単価"形式）を更新し、Gitコミット＆プッシュする。

## エラー処理

- WebFetch失敗 → そのSitemap/物件をスキップして次へ
- メール送信失敗 → ログ出力。Telegram通知は試みる
- Git push失敗 → ログ出力（次回実行時に再検出される）

## 注意事項

- 物件詳細ページの取得は **1件ごとに2秒待機** すること（サーバー負荷防止）
- WebFetchは認証不要のページ取得にのみ使用すること
- 認証ヘッダーが必要なAPIコール（メール、Telegram）は必ずBash+curlで行うこと
- state/livex.jsonは12MB超の大ファイル。全体を一度に出力しないこと

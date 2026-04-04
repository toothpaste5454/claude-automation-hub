# 自動化ハブ

このリポジトリはClaude Code Scheduleによって1時間ごとに実行される。
現在時刻（JST）を確認し、該当するタスクのみ実行すること。

---

## タスク1：Livex物件チェック

**実行時刻**: 9時台・15時台・21時台（JST）のみ実行

### 手順

1. **state/livex.jsonを読む**
   既知の建物情報（lastmod・通知済みフロア）が記録されている。

2. **Sitemapを取得**（WebFetch）
   以下10件を順に取得する：
   - https://www.livex-inc.com/search/detail/sitemap_0.xml
   - https://www.livex-inc.com/search/detail/sitemap_1.xml
   - （同様にsitemap_2.xml ～ sitemap_9.xml）

   各XMLから `<loc>` タグのURLと `<lastmod>` を抽出し、URLから物件IDを取得する。
   例: `https://www.livex-inc.com/search/detail/facility_index.php?id=12345` → ID=12345

3. **新規・更新ビルを特定**
   - state/livex.jsonに存在しないID → 新規ビル
   - lastmodがstate内の値と異なる → 更新ビル
   - **初回実行（state/livex.jsonが空）の場合は全ビルをstateに登録するだけで通知しない**

4. **物件詳細を取得**（WebFetch）
   各ビルの詳細ページを取得する（1件ごとに2秒待機すること）：
   `https://www.livex-inc.com/search/detail/facility_index.php?id={ID}`

   以下の情報を抽出する：
   - 物件名: `<h1>` タグ
   - 所在地: 「所在地」行のテーブルセル
   - 各フロア情報: テーブルから「坪数/面積」「坪単価/賃料(坪)」「月額賃料」列

5. **フィルタリング**
   以下の全条件を満たすフロアのみ対象とする：
   - エリア（住所に含まれるか）: 大田区, 品川区, 世田谷区, 目黒区, 渋谷区,
     中央区, 千代田区, 台東区, 港区, 鶴見区, 川崎区, 中原区, 高津区,
     宮前区, 多摩区, 神奈川区, 港北区, 西区
   - 面積: 65坪以上120坪以下
   - 坪単価: 10,000円以下

6. **新着物件があればメールを送信**（WebFetch POST）
   ```
   POST {VERCEL_API_URL}/api/send-email
   Header: x-cron-secret: {CRON_SECRET}
   Content-Type: application/json

   {
     "subject": "【新着物件】Livex N件 (YYYY-MM-DD)",
     "properties": [
       {
         "name": "物件名",
         "url": "https://www.livex-inc.com/search/detail/facility_index.php?id=XXX",
         "area": "大田区",
         "address": "東京都大田区...",
         "tsubo": "85坪",
         "price_per_tsubo": "8,500円",
         "monthly_rent": "722,500円"
       }
     ]
   }
   ```

7. **state/livex.jsonを更新してコミット**
   処理した全ビルのlastmodと通知済みフロアキー（"坪数|坪単価"形式）を更新し、
   Gitコミットする。

---

## タスク2：（将来追加予定）

新しいタスクはここに追記する。

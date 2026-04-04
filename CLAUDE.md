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
   POST https://claudeautomationhub.vercel.app/api/send-email
   Header: x-cron-secret: funJQTZBIEDAGPzD3najmf+OfXrSDdPJXUmm8dB0J5k=
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

## タスク2：Xバズ投稿 リサーチ＆自動生成

**実行時刻**: 8時台（JST）のみ実行（毎朝8:00〜8:59）

### 手順

1. **WebSearchで今日のAI/テクノロジートレンドを5件調査**
   以下のキーワードで検索し、信頼できるソース（TechCrunch, Gigazine, Wired, NHK, ITmedia等）の記事を5件選ぶ：
   - 「AI 最新 2026」
   - 「ChatGPT OR Claude OR Gemini 新機能」
   - 「生成AI ビジネス 活用 事例」

2. **各トピックのバズ投稿文をGemini APIで生成**（WebFetch）
   5件それぞれについて以下のAPIを呼び出す：
   ```
   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaSyDsG3nsnHJOWJZSP3yvKOqyBbA30YE42j8
   Content-Type: application/json

   {
     "contents": [{"parts": [{"text": "あなたはXでバズる投稿を作るプロです。\n以下のトピックについてXでバズりやすい日本語投稿文を作成してください。\nトピック: {記事タイトル}\nソースURL: {記事URL}\n条件: 120文字以内、読者が思わず止まる冒頭、具体的な数字・事実を含む、末尾にソースURL、ハッシュタグ1〜2個\n投稿文のみ返答してください:"}]}],
     "generationConfig": {"temperature": 0.9, "maxOutputTokens": 300}
   }
   ```

3. **Supabaseにリサーチ結果と投稿文を保存**（WebFetch）

   **research_topicsに保存**（5件ループ）:
   ```
   POST https://hebgqbklfnawsedqbqnp.supabase.co/rest/v1/research_topics
   apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYmdxYmtsZm5hd3NlZHFicW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjMwMDUsImV4cCI6MjA4OTMzOTAwNX0.3Vm70_v6LHLCQICqxb6z1cl_YIbvzdSrK-Gpl5MJEMs
   Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhlYmdxYmtsZm5hd3NlZHFicW5wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3NjMwMDUsImV4cCI6MjA4OTMzOTAwNX0.3Vm70_v6LHLCQICqxb6z1cl_YIbvzdSrK-Gpl5MJEMs
   Content-Type: application/json
   Prefer: return=minimal

   {"title": "記事タイトル", "summary": "3行以内の要約", "url": "記事URL", "genre": "AI/テクノロジー", "researched_at": "YYYY-MM-DD"}
   ```

   **buzz_postsに保存**（5件ループ）:
   ```
   POST https://hebgqbklfnawsedqbqnp.supabase.co/rest/v1/buzz_posts
   （同じヘッダー）

   {"text": "生成した投稿文", "source_url": "記事URL", "source_title": "記事タイトル", "status": "ready"}
   ```

4. **メール通知**（WebFetch）
   ```
   POST https://claudeautomationhub.vercel.app/api/send-buzz-notification
   x-cron-secret: funJQTZBIEDAGPzD3najmf+OfXrSDdPJXUmm8dB0J5k=
   Content-Type: application/json

   {
     "researchCount": 5,
     "posts": [
       {"text": "投稿文1", "source_url": "URL1", "source_title": "タイトル1"},
       ...
     ]
   }
   ```

5. **注意事項**
   - Supabaseが休止中の場合はエラーになる（その日はスキップ）
   - 通知メールが届かない場合でもSupabaseへの保存は試みること
   - 同じURLが既にresearch_topicsにある場合は重複登録しない（当日分のみチェック）

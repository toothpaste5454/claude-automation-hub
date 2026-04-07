# 自動化ハブ

このリポジトリはClaude Code Scheduleによって1時間ごとに実行される。
現在時刻（JST）を確認し、該当するタスクのみ実行すること。

**時刻確認方法（必須）**: 実行環境はUTCのため、必ず以下のコマンドでJST時刻を取得すること：
```bash
TZ=Asia/Tokyo date +%H
```
このコマンドの出力値（0〜23の整数）を「現在のJST時」として使用すること。`date +%H` のみ（TZ指定なし）は使用禁止。

---

## 事前準備：設定値の取得

**最初に必ずこのステップを実行すること。**

プロンプトに含まれている `CRON_SECRET` の値を使って以下のAPIを呼び出し、設定値を取得する：

```
GET https://claudeautomationhub.vercel.app/api/get-config
Header: x-cron-secret: {プロンプトに記載されたCRON_SECRETの値}
```

レスポンスのJSONから以下の値を取り出して、以降の全ステップで使用すること：
- `telegram_bot_token`
- `telegram_chat_id`
- `gemini_api_key`
- `supabase_url`
- `supabase_anon_key`
- `email_endpoint`
- `buzz_endpoint`

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
   POST {email_endpoint}
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

7. **Telegram通知**（WebFetch POST）
   ```
   POST https://api.telegram.org/bot{telegram_bot_token}/sendMessage
   Content-Type: application/json

   新着あり:
   {"chat_id": "{telegram_chat_id}", "text": "🏢 *Livex物件チェック完了*\n新着 N件を検出しメール送信しました。", "parse_mode": "Markdown"}

   新着なし:
   {"chat_id": "{telegram_chat_id}", "text": "🏢 *Livex物件チェック完了*\n本日の新着物件はありませんでした。", "parse_mode": "Markdown"}
   ```

8. **state/livex.jsonを更新してコミット**
   処理した全ビルのlastmodと通知済みフロアキー（"坪数|坪単価"形式）を更新し、
   Gitコミットする。

---

## タスク2：Xバズ投稿 リサーチ＆自動生成

**実行時刻**: 8時台（JST）のみ実行（毎朝8:00〜8:59）

### 手順

1. **WebSearchで今日のAI/テクノロジートレンドを調査（国内3件＋海外3件）**

   **国内リサーチ**（日本語ソース）:
   信頼できるソース（TechCrunch Japan, Gigazine, Wired Japan, NHK, ITmedia等）から3件選ぶ：
   - 「AI 最新 2026」
   - 「ChatGPT OR Claude OR Gemini 新機能」
   - 「生成AI ビジネス 活用 事例」

   **海外バズ投稿リサーチ**（英語圏X/SNSでバズっている内容）:
   英語圏でバズっているAI/テック関連の投稿・記事を3件選ぶ：
   - "viral AI twitter post 2026"
   - "trending AI technology tweet this week"
   - "most liked AI post X twitter today"
   対象ソース: Twitter/X, TechCrunch, The Verge, Wired, Ars Technica等

2. **各トピックのバズ投稿文をGemini APIで生成**（WebFetch）
   6件それぞれについて以下のAPIを呼び出す。
   **海外ソースの場合は日本語化＋日本向けローカライズも行う**（直訳不可。日本の文化・ビジネス感覚に合わせた言い回しにすること）：
   ```
   POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_api_key}
   Content-Type: application/json

   国内ソースの場合:
   {
     "contents": [{"parts": [{"text": "あなたはXでバズる投稿を作るプロです。\n以下のトピックについてXでバズりやすい日本語投稿文を作成してください。\nトピック: {記事タイトル}\nソースURL: {記事URL}\n条件: 120文字以内、読者が思わず止まる冒頭、具体的な数字・事実を含む、末尾にソースURL、ハッシュタグ1〜2個\n投稿文のみ返答してください:"}]}],
     "generationConfig": {"temperature": 0.9, "maxOutputTokens": 300}
   }

   海外ソースの場合:
   {
     "contents": [{"parts": [{"text": "あなたはXでバズる投稿を作るプロです。\n以下の英語圏でバズった内容を日本人向けにローカライズしてX投稿文を作成してください。\n直訳は禁止。日本のビジネス・IT文化に合わせた表現にすること。\n元ネタ: {英語の内容・タイトル}\n元ネタURL: {URL}\n条件: 120文字以内、冒頭で日本人が思わず反応する一言、具体的な数字・驚き要素を含む、末尾に元ネタURL、ハッシュタグ1〜2個\n投稿文のみ返答してください:"}]}],
     "generationConfig": {"temperature": 0.9, "maxOutputTokens": 300}
   }
   ```

3. **Supabaseにリサーチ結果と投稿文を保存**（WebFetch）

   **research_topicsに保存**（5件ループ）:
   ```
   POST {supabase_url}/rest/v1/research_topics
   apikey: {supabase_anon_key}
   Authorization: Bearer {supabase_anon_key}
   Content-Type: application/json
   Prefer: return=minimal

   国内: {"title": "記事タイトル", "summary": "3行以内の要約", "url": "記事URL", "genre": "AI/テクノロジー", "researched_at": "YYYY-MM-DD"}
   海外: {"title": "【海外】元の英語タイトル（日本語訳）", "summary": "3行以内の要約（日本語）", "url": "元ネタURL", "genre": "AI/テクノロジー（海外）", "researched_at": "YYYY-MM-DD"}
   ```

   **buzz_postsに保存**（5件ループ）:
   ```
   POST {supabase_url}/rest/v1/buzz_posts
   （同じヘッダー）

   {"text": "生成した投稿文", "source_url": "記事URL", "source_title": "記事タイトル", "status": "ready"}
   ```

4. **メール通知**（WebFetch）
   ```
   POST {buzz_endpoint}
   x-cron-secret: {CRON_SECRET}
   Content-Type: application/json

   {
     "researchCount": 5,
     "posts": [
       {"text": "投稿文1", "source_url": "URL1", "source_title": "タイトル1"},
       ...
     ]
   }
   ```

5. **Telegram通知**（WebFetch POST）
   生成した投稿文の先頭2件のテキストを含めて通知する：
   ```
   POST https://api.telegram.org/bot{telegram_bot_token}/sendMessage
   Content-Type: application/json

   {
     "chat_id": "{telegram_chat_id}",
     "text": "📢 *今日のXバズ投稿 生成完了*\n\nN件生成しました。\n\n▼ 投稿例1\n{投稿文1の先頭80文字}...\n\n▼ 投稿例2\n{投稿文2の先頭80文字}...\n\nブラウザUIで確認してください。",
     "parse_mode": "Markdown"
   }
   ```

6. **注意事項**
   - Supabaseが休止中の場合はエラーになる（その日はスキップ）
   - 通知メールが届かない場合でもSupabaseへの保存は試みること
   - 同じURLが既にresearch_topicsにある場合は重複登録しない（当日分のみチェック）
   - Telegram通知はメール通知の後に送ること

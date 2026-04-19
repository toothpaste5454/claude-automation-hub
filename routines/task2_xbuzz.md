# Task2: X-buzz投稿 リサーチ＆自動生成

## 概要

AI/テクノロジー分野のトレンドを調査し、Xでバズりやすい投稿文を自動生成してSupabaseに保存する。
国内3件＋海外3件の計6件を毎朝生成する。

## 使用する環境変数

- `$GEMINI_API_KEY` — Gemini 2.5 Flash Lite（テキスト生成）
- `$SUPABASE_URL` — Supabase REST API
- `$SUPABASE_ANON_KEY` — Supabase認証
- `$CRON_SECRET` — Vercel API認証
- `$BUZZ_ENDPOINT` — メール通知エンドポイント
- `$TELEGRAM_ENDPOINT` — Telegram通知エンドポイント

## 手順

### ステップ1: WebSearchでトレンドを調査

WebSearchツールで以下の検索を行い、信頼できるソースから合計6件のトピックを選ぶ。

**国内3件（日本語検索）:**
- 「AI 最新ニュース 2026」
- 「ChatGPT OR Claude OR Gemini 新機能」
- 「生成AI ビジネス 活用」

信頼できるソース: TechCrunch Japan, Gigazine, Wired Japan, NHK, ITmedia等

**海外3件（英語検索）:**
- "viral AI twitter post 2026"
- "trending AI technology tweet this week"
- "most liked AI post today"

対象ソース: Twitter/X, TechCrunch, The Verge, Wired, Ars Technica等

各トピックについて「タイトル」「要約（3行以内）」「URL」をメモすること。

### ステップ2: Gemini APIで投稿文を生成

6件それぞれについて以下のcurlコマンドをBashツールで実行する。

**国内ソースの場合:**
```bash
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "あなたはXでバズる投稿を作るプロです。以下のトピックについてXでバズりやすい日本語投稿文を作成してください。トピック: {タイトル} ソースURL: {URL} 条件: 120文字以内、読者が思わず止まる冒頭、具体的な数字・事実を含む、末尾にソースURL、ハッシュタグ1〜2個。投稿文のみ返答してください:"}]}],
    "generationConfig": {"temperature": 0.9, "maxOutputTokens": 300}
  }'
```

**海外ソースの場合:**
```bash
curl -s -X POST "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=$GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{"parts": [{"text": "あなたはXでバズる投稿を作るプロです。以下の英語圏でバズった内容を日本人向けにローカライズしてX投稿文を作成してください。直訳は禁止。日本のビジネス・IT文化に合わせた表現にすること。元ネタ: {内容} 元ネタURL: {URL} 条件: 120文字以内、冒頭で日本人が思わず反応する一言、具体的な数字・驚き要素を含む、末尾に元ネタURL、ハッシュタグ1〜2個。投稿文のみ返答してください:"}]}],
    "generationConfig": {"temperature": 0.9, "maxOutputTokens": 300}
  }'
```

### ステップ3: Supabaseに保存

**research_topicsに保存（6件ループ）:**
```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/research_topics" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"title":"タイトル","summary":"要約","url":"URL","genre":"AI/テクノロジー","researched_at":"YYYY-MM-DD"}'
```

海外ソースの場合: titleの先頭に「【海外】」を付け、genreは「AI/テクノロジー（海外）」にする。

**buzz_postsに保存（6件ループ）:**
```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/buzz_posts" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=minimal" \
  -d '{"text":"生成した投稿文","source_url":"URL","source_title":"タイトル","status":"ready"}'
```

### ステップ4: メール通知

```bash
curl -s -X POST "$BUZZ_ENDPOINT" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"researchCount":6,"posts":[{"text":"投稿文","source_url":"URL","source_title":"タイトル"},...]}'
```

### ステップ5: Telegram通知

```bash
curl -s -X POST "$TELEGRAM_ENDPOINT" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"text":"📢 *今日のXバズ投稿 生成完了*\n\nN件生成しました。\n\n▼ 投稿例1\n{投稿文1の先頭80文字}...\n\n▼ 投稿例2\n{投稿文2の先頭80文字}...\n\nブラウザUIで確認してください。"}'
```

## エラー処理

- Gemini API 503/429エラー → 10秒待ち × 最大3回リトライ。3回失敗したらそのトピックをスキップ
- Supabase保存失敗 → エラーログを出力してスキップ。通知は試みる
- 通知失敗 → ログ出力のみ（データ保存が優先）

## 注意事項

- Geminiモデルは必ず `gemini-2.5-flash-lite` を使うこと（2.5-flashは503頻発、2.0-flashはquota制限）
- 認証ヘッダーが必要なAPIコールは必ずBash+curlで行うこと
- 同じURLが既にresearch_topicsにある場合は重複登録しない（当日分のみチェック）
- Telegram通知はメール通知の後に送ること

# Task2: Xバズ投稿 リサーチ＆自動生成

## 概要

AI/テクノロジー分野のトレンドを調査し、Xでバズりやすい投稿文を自動生成する。
結果はJSONファイルとしてgit pushし、Vercel Cronが自動でSupabase保存＆通知を行う。

## アーキテクチャ（v4: リモートセッション + Vercel Cron連携）

```
[リモートセッション 8:00 JST]
    ├── RSS取得 (curl GET) → AIニュース収集
    ├── Claude自身が投稿文を生成（Gemini不要）
    ├── output/buzz_YYYY-MM-DD.json に書き出し
    └── git commit & push

[Vercel Cron 8:30 JST]  ← /api/process-buzz
    ├── GitHub Raw URLからJSONを取得
    ├── Supabase (research_topics + buzz_posts) に保存
    ├── メール通知
    └── Telegram通知
```

**v4移行の理由**: リモートセッションのClaudeが外部APIへのPOSTリクエストを「ソフトウェアエンジニアリングタスクではない」として実行拒否するため、ファイル書き出し＋git push（SE作業）と外部API呼び出し（Vercel Cron）を分離。

## リモートセッション側の手順

### ステップ1: AI/テクノロジーニュースの収集

curl GETでGoogle News RSSを取得し、国内3件＋海外3件を選ぶ。

国内ソース:
- `https://news.google.com/rss/search?q=AI+最新&hl=ja&gl=JP&ceid=JP:ja`
- `https://news.google.com/rss/search?q=生成AI+新機能&hl=ja&gl=JP&ceid=JP:ja`

海外ソース:
- `https://news.google.com/rss/search?q=AI+technology+trending&hl=en-US&gl=US&ceid=US:en`
- `https://news.google.com/rss/search?q=ChatGPT+OR+Claude+OR+Gemini+new&hl=en-US&gl=US&ceid=US:en`

**フォールバック**: RSS取得が失敗した場合、Claudeの知識から最新トレンドを6件選ぶ。

### ステップ2: 投稿文を生成

Claude自身が投稿文を作成（Gemini API不要）。
- 120文字以内
- 読者が思わず止まる冒頭
- 具体的な数字・事実を含む
- 末尾にソースURL
- ハッシュタグ1〜2個
- 海外ソースは日本人向けにローカライズ（直訳禁止）

### ステップ3: JSONファイルに書き出し

`output/buzz_YYYY-MM-DD.json` に以下のフォーマットで書き出す:

```json
{
  "date": "YYYY-MM-DD",
  "topics": [
    {
      "title": "記事タイトル",
      "summary": "3行以内の要約",
      "url": "https://...",
      "genre": "AI/テクノロジー",
      "source": "domestic"
    }
  ],
  "posts": [
    {
      "text": "バズ投稿文",
      "source_url": "https://...",
      "source_title": "記事タイトル"
    }
  ]
}
```

source: 国内 → "domestic"、海外 → "international"

### ステップ4: git commit & push

```bash
git add output/
git commit -m "Add buzz posts for YYYY-MM-DD"
git push
```

## Vercel Cron側（/api/process-buzz）

- 毎日 8:30 JST (cron: `30 23 * * *` UTC) に自動実行
- GitHub Raw URLから当日のJSONを取得
- Supabaseに research_topics + buzz_posts を保存
- メール通知 + Telegram通知
- 認証: `x-cron-secret` ヘッダー（Vercel Cronが自動付与）

## エラー処理

- RSS取得失敗 → Claudeの知識からトレンドを生成
- git push失敗 → Vercel Cron側は翌日分から再開
- JSON未検出（Cron側）→ 404レスポンスで終了（通知なし）

## 注意事項

- リモートセッションでは**外部APIへのPOSTリクエスト禁止**（Claudeが実行拒否する）
- curlはGETリクエスト（RSS取得）にのみ使用
- Gemini API不要（Claude自身が投稿文を書く）
- DB保存・通知はVercel Cronが処理するため、リモートセッション側では不要

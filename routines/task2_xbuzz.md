# Task2: Xバズ投稿 リサーチ＆自動生成（v5: 2026-04-23更新）

## 概要

AI/テクノロジー分野のトレンドを調査し、Xでバズりやすい投稿文を自動生成する。
結果はJSONファイルとしてgit pushし、Vercel Cronが自動でSupabase保存＆通知を行う。

## v5更新の理由（2026-04-23）

v4で以下の問題が発生したため修正：
- セッションが日付を誤認識し、古い`buzz_2026-04-21.json`を再利用（4/22・4/23の生成が2日連続で失敗）
- `Check if output directory exists`で既存ファイルを見つけると新規生成をスキップしていた
- Google News RSS取得がリモートセッションでは恒常的にネットワーク制限でブロックされる

### v5の改善点

1. 冒頭で必ず `date` コマンドで今日の日付（JST）を取得する
2. 既存ファイルチェックを撤廃（毎回必ず上書き生成）
3. RSS取得を省略し、最初からClaudeの知識ベースで6件選定（RSSは常にブロックされるため）
4. 最初にブランチを`main`に揃える（detached HEAD対策）

## アーキテクチャ

```
[リモートセッション 8:00 JST]
    ├── 今日の日付取得（date コマンド）
    ├── main ブランチをpull
    ├── Claudeが知識ベースから6件選定
    ├── 投稿文を生成
    ├── output/buzz_{TODAY}.json に書き出し（既存ファイルは上書き）
    └── git commit & push

[Vercel Cron 8:30 JST]  ← /api/process-buzz
    ├── GitHub Raw URLから {TODAY}.json を取得
    ├── Supabase (research_topics + buzz_posts) に保存
    └── メール通知 + Telegram通知
```

---

## リモートセッション側の手順（トリガーに埋め込むプロンプト本体）

あなたはXバズ投稿のリサーチ＆コンテンツ生成ボットです。
以下の手順を**必ず上から順に**実行してください。

**重要な制約:**
- 外部APIへのPOSTリクエストは一切行わないこと（通知・DB保存はVercel Cronの担当）
- 既存のJSONファイルを再利用しないこと。毎回必ず今日の日付で新規生成する
- 今日の日付は`date`コマンドで取得した値のみ信用すること（知識ベースの日付は使わない）

### ステップ0: 今日の日付を取得する

Bashツールで以下を実行する：

```bash
TODAY=$(TZ=Asia/Tokyo date +%Y-%m-%d)
echo "TODAY=$TODAY"
```

**以降、`$TODAY`で出力された日付（例: 2026-04-23）を今日の日付として使うこと。**
他のどこにも（自分の知識、既存ファイル名など）日付を頼らないこと。

### ステップ1: リポジトリの状態を整える

detached HEADや古いブランチ状態を避けるため、最初に以下を実行する：

```bash
git checkout main
git pull origin main
git status
```

### ステップ2: AI/テクノロジートレンドを6件選定

リモートセッションではGoogle News RSSがネットワーク制限でブロックされるため、
**Claudeの知識ベースから直接6件選定する**（RSS取得は試みなくてよい）。

- 国内トレンド 3件（`source: "domestic"`）
- 海外トレンド 3件（`source: "international"`）

選定基準：
- AI/生成AI/LLM/機械学習に関する直近1〜2週間の動向
- ChatGPT / Claude / Gemini / オープンソースLLM / AIツールの新機能・発表・事例
- 日本人ユーザーに関心の高いトピック

各トピックについて以下を用意する：
- `title`: 記事タイトル（Claudeが生成）
- `summary`: 3行以内の要約
- `url`: 情報源URL（公式発表・公式ブログ等の実在するURLを使うこと）
- `genre`: "AI/テクノロジー"
- `source`: "domestic" or "international"

### ステップ3: 投稿文を生成

6件それぞれについて、以下の条件でXでバズりやすい日本語投稿文を作成する：

- 120文字以内
- 読者が思わず止まる冒頭
- 具体的な数字・事実を含む
- 末尾にソースURL
- ハッシュタグ1〜2個
- 海外ソースの場合は日本人向けにローカライズすること（直訳禁止）

### ステップ4: JSONファイルに書き出し

Writeツールで `output/buzz_${TODAY}.json` に以下のフォーマットで書き出す。
**既存ファイルがある場合も必ず上書きすること**（今日生成した最新の投稿で置き換える）。

ファイル名の`${TODAY}`はステップ0で取得した値に置換する。
例: 今日が2026-04-23なら `output/buzz_2026-04-23.json`

```json
{
  "date": "2026-04-23",
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

### ステップ5: git commit & push

Bashツールで以下を順番に実行する。
`$GH_TOKEN`はRoutinesの`automation-hub` Environmentに登録してある環境変数。
リモートセッションのgit proxyに`contents: write`権限がないため、tokenをリモートURLに埋め込む必要がある。

```bash
git remote set-url origin "https://${GH_TOKEN}@github.com/toothpaste5454/claude-automation-hub.git"
git add output/buzz_${TODAY}.json
git commit -m "Add buzz posts for ${TODAY}"
git push origin main
```

`${TODAY}`はステップ0で取得した値に置換すること。
`${GH_TOKEN}`は環境変数をそのまま参照する（トークンをプロンプトに直書きしないこと）。

push後、`git log -1 --oneline`で新しいコミットがmainに入っていることを確認する。

---

## Vercel Cron側（/api/process-buzz）

- 毎日 8:30 JST (cron: `30 23 * * *` UTC) に自動実行
- GitHub Raw URLから当日のJSONを取得
- Supabaseに research_topics + buzz_posts を保存
- メール通知 + Telegram通知
- 認証: `x-cron-secret` ヘッダー（Vercel Cronが自動付与）
- 手動オーバーライド: `?date=YYYY-MM-DD` で任意の日付を指定可能

## エラー処理

- git push失敗 → セッション失敗として扱う（Vercel Cron側は404で通知なしになる）
- JSON書き出し失敗 → セッション失敗として扱う
- JSON未検出（Cron側）→ 404レスポンスで終了（通知なし）

## 注意事項

- リモートセッションでは**外部APIへのPOSTリクエスト禁止**（Claudeが実行拒否する）
- curlは使わない（RSS取得も不要）
- Gemini API不要（Claude自身が投稿文を書く）
- DB保存・通知はVercel Cronが処理するため、リモートセッション側では不要
- 日付は必ず`date`コマンドで取得すること。知識ベースの日付や既存ファイル名から推測しないこと

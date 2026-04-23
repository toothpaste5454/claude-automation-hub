# 自動化ハブ

## スケジューリング方式（2026-04-20 移行）

旧RemoteTriggerは`next_run_at`凍結バグ（GitHub Issue #42662）のため廃止。
全トリガーを自己完結型プロンプト（v2）に移行済み。

- プロンプトテンプレート: `routines/` ディレクトリ
- 詳細: `routines/README.md` を参照

### 稼働中トリガー一覧

| トリガーID | 名前 | JST実行時刻 |
|---|---|---|
| `trig_017LyrzBCaqNUiEcn6XA4Hft` | X-buzz投稿生成 v3 | 毎朝 8:00 |
| `trig_01Cp4th4FBhYNb7f4n5ysw1k` | Livex物件チェック v2 | 毎日 9:00 |
| `trig_0149jRqrxoZgGvx2nXDyspha` | Livex物件チェック v2 | 毎日 15:00 |
| `trig_012GodStUcHyaXgwhZk1g1Yp` | Livex物件チェック v2 | 毎日 21:00 |

**v2方式**: プロンプトに全手順・設定値を直接埋め込み。CLAUDE.md参照やget-config API呼び出しは不要。

---

## 共通ルール（全タスク共通）

**APIコール方法（必須）**: カスタムヘッダー（`x-cron-secret`, `apikey`, `Authorization`, `Content-Type`等）が必要なHTTPリクエストは、**必ずBashツールで`curl`コマンドを使うこと**。WebFetchツールはカスタムヘッダーを設定できないため、認証付きAPIには使用禁止。WebFetchは認証不要の単純なWebページ取得（Sitemap、物件ページ等）にのみ使用すること。

**APIエラー時のリトライ（必須）**: Gemini API等が503や429エラーを返した場合、10秒待ってから最大3回リトライすること。3回失敗したら該当トピックをスキップして次に進むこと。

**Vercel Cron エンドポイント認証（必須）**: Vercel Cron から呼ばれるAPI Routeは `Authorization: Bearer <CRON_SECRET>` で認証すること（公式仕様）。独自ヘッダー（`x-cron-secret`等）はCronから送られないため、Cron専用エンドポイントには使ってはいけない。手動 curl テスト用に互換ヘッダーを残すのは可。新規Cronを追加する際は、本番投入前に `curl -H "Authorization: Bearer $CRON_SECRET"` で200応答を必ず確認すること。

---

## 事前準備：設定値の取得（Livexタスク用）

**Livex物件チェックタスクで使用。** X-buzzタスクはRoutineの環境変数から直接取得するためこのステップは不要。

プロンプトに含まれている `CRON_SECRET` の値を使って以下のAPIを呼び出し、設定値を取得する（**Bashツールでcurlを使うこと**）：

```bash
curl -s -H "x-cron-secret: {CRON_SECRET}" "https://claudeautomationhub.vercel.app/api/get-config"
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

6. **新着物件があればメールを送信**（Bash curl）
   ```bash
   curl -s -X POST "{email_endpoint}" \
     -H "x-cron-secret: {CRON_SECRET}" \
     -H "Content-Type: application/json" \
     -d '{"subject":"【新着物件】Livex N件 (YYYY-MM-DD)","properties":[...]}'
   ```

7. **Telegram通知**（Bash curl）
   ```bash
   # 新着あり
   curl -s -X POST "https://claudeautomationhub.vercel.app/api/send-telegram" \
     -H "x-cron-secret: {CRON_SECRET}" \
     -H "Content-Type: application/json" \
     -d '{"text":"🏢 *Livex物件チェック完了*\n新着 N件を検出しメール送信しました。"}'

   # 新着なし
   curl -s -X POST "https://claudeautomationhub.vercel.app/api/send-telegram" \
     -H "x-cron-secret: {CRON_SECRET}" \
     -H "Content-Type: application/json" \
     -d '{"text":"🏢 *Livex物件チェック完了*\n本日の新着物件はありませんでした。"}'
   ```

8. **state/livex.jsonを更新してコミット**
   処理した全ビルのlastmodと通知済みフロアキー（"坪数|坪単価"形式）を更新し、
   Gitコミットする。

---

## タスク2：Xバズ投稿 リサーチ＆自動生成（v4: リモートセッション + Vercel Cron連携）

**v4移行理由**: リモートセッションのClaudeが外部APIへのPOSTリクエストを実行拒否するため、ファイル書き出し＋git push（リモートセッション）とDB保存＋通知（Vercel Cron）に分離。

### アーキテクチャ

```
[リモートセッション 8:00 JST] → output/buzz_YYYY-MM-DD.json → git push
[Vercel Cron 8:30 JST] → /api/process-buzz → Supabase保存 + メール + Telegram
```

### リモートセッション側（トリガー: trig_017LyrzBCaqNUiEcn6XA4Hft）

1. RSS取得（curl GET）→ 国内3件＋海外3件のAIニュースを選定
2. Claude自身が投稿文を生成（Gemini API不要）
3. `output/buzz_YYYY-MM-DD.json` に書き出し
4. `git add output/ && git commit && git push`

**外部APIへのPOSTは一切行わない。**

### Vercel Cron側（/api/process-buzz、毎日8:30 JST）

1. GitHub Raw URLから当日のJSONを取得
2. Supabase（research_topics + buzz_posts）に保存
3. メール通知（send-buzz-notification相当）
4. Telegram通知

詳細は `routines/task2_xbuzz.md` を参照。

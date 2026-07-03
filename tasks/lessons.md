# Lessons

## 2026-07-03: Vercel Hobbyプランの「Cron 2個まで」制限で3つ目のCronが自動発火しなかった

**事象**: `check-github-usage.js`（毎日8:00 JST予定）を手動curlすると正常動作するのに、当日朝は一通も自動通知が来なかった。`vercel crons ls`には3件（`process-buzz`, `generate-daily-thread`, `check-github-usage`）とも正しく表示されており、設定ミスは見当たらなかった。

**根本原因**: Vercel API（`GET https://api.vercel.com/v2/user`）で確認したところ、このアカウントは`"plan": "hobby"`（無料プラン）だった。Vercel Hobbyプランは**1プロジェクトあたりCron Jobsが2つまで**という制限があり、`vercel.json`に3つ定義していても、ダッシュボード上の一覧やCLIの`vercel crons ls`には表示されるが、**3つ目以降は実際にはスケジュール発火しない**（手動叩き・`workflow_dispatch`相当のトリガーだけは動く）。

**対処**:
- `check-github-usage`のトリガーをVercel CronからGitHub Actionsの`schedule` cronに移行（`.github/workflows/check-github-usage.yml`、毎日12:00 JST = `0 3 * * *`）。ワークフローがVercelの`/api/check-github-usage`をcurlで呼ぶだけの薄い構成。
- `vercel.json`の`crons`配列から`check-github-usage`エントリを削除し、Vercel側は2つ（`process-buzz`, `generate-daily-thread`）に戻した。
- GitHub Actions Secrets（リポジトリ設定）に`CRON_SECRET`をVercelと同じ値で登録し、`x-cron-secret`ヘッダーで認証。

**防止ルール**:
- Vercel Cronを新規追加する際は、必ず`vercel.json`の`crons`配列が**2件以内**に収まっているか確認すること（Hobbyプランの上限）。3件目以降を追加したい場合は、①Proプランへのアップグレード、②GitHub Actionsの`schedule`ワークフローに逃がす、③既存Cronの処理に相乗りさせる、のいずれかを選ぶこと。
- `vercel crons ls`や`vercel.json`に定義があっても「実際に発火するか」はイコールではない。プラン上限の疑いがある場合は`GET https://api.vercel.com/v2/user`のレスポンスの`billing.plan`で契約プランを確認できる。
- 「手動では動くのに自動発火だけ来ない」症状が出たら、まずCronの本数とプラン上限を疑うこと（コードのバグとは限らない）。

---

## 2026-07-03: GitHub Actions残り分数通知の文言修正・API精度の限界を確認

**事象**: 「GitHub Actionsの残り利用可能時間を毎日Telegram通知したい」という依頼を受け、既存実装（`api/check-github-usage.js`、2026-06-11導入）の存在に気づかず新規実装を作りかけた。調査の結果、以下が判明：

1. **既存実装は既に本番稼働していた**が、失敗時にTelegram通知しない設計だったため「動いているのか壊れているのか」が分からず、依頼時点では通知を受け取れていなかった。
2. **通知文言のバグ**: `${actionsMinutes} 分 / ${LIMIT} 分 (${percent}%)` という表記が「使用量」なのに「残り」と誤読しやすい形式だった。実際は逆で、`1519分/2000分(76%)`は「76%使用済み・残り24%（481分）」を意味していた。
3. **GitHub Billing APIの新旧仕様**: 旧`/settings/billing/actions`エンドポイントは廃止済み（HTTP 410）。現行は`/settings/billing/usage`（`usageItems`配列、月×リポジトリ単位で集計）を使う必要がある。
4. **利用レポートAPIには反映ラグがある**: 手動確認時点で自前APIは「1,519分使用（76%）」と返したが、同時刻にGitHubから届いた公式Budgetアラートメールでは「1,805分使用（90%）」だった。差は286分。`/settings/billing/usage`はGitHub内部のリアルタイム課金カウンターに対して遅延があり、直近の消費が数百分単位で反映されないことがある。

**対処**:
- 新規実装は破棄し、既存の`api/check-github-usage.js`を修正する方針に変更（commit: 178c0d7）。
- Telegram文言を「残り: ○○分 / 2000分、使用済み: ○○分 (○○%)」に変更し、「残り」を明示。
- API取得失敗時にTelegramへエラー通知する処理を追加（`process-buzz.js`と同じ`sendTelegramAlert`パターンを流用）。

**防止ルール**:
- 新しい自動化を作る前に、必ず `api/` ディレクトリと `vercel.json` の `crons` 一覧、`git log` を確認し、同名・類似目的の実装が既にないか確認すること。
- Cron APIは失敗時に必ずTelegramへアラートを送る設計にすること（サイレント失敗は「動いているか」の判断を不可能にする）。
- 「残り」を表示する通知は、変数名・表示文言の両方で「使用量」と混同しないよう明示的に書くこと（`usedMinutes` / `remainingMinutes`のように変数名からして区別する）。
- GitHub Actionsの残り分数は`/settings/billing/usage`で取得できるが、**数時間〜1日程度の反映ラグがあり、正確なリアルタイム値ではない**ことを前提に運用する。閾値到達時の一次情報はGitHub公式のBudgetアラートメール（Actions設定で$0予算を設定すると75/90/100%で自動送信される）を優先する。

---

## 2026-04-28: Vercel Cron が自動実行されなかった → process-buzz にエラー通知を追加

**事象**: 4/28 8:30 JSTに Vercel Cron（`/api/process-buzz`）が自動実行されず、Telegram・メール通知が届かなかった。Routine（8:16 完了）は正常で、`buzz_2026-04-28.json` の git push も成功していた。手動で `/api/process-buzz?date=2026-04-28` を叩いたところ正常動作（`research:6, posts:6`）。

**根本原因**: Vercel Cron が当該時刻に発火しなかった（プラットフォーム側の問題または前回デプロイとのタイミング干渉の可能性。詳細不明）。

**対処**:
- `api/process-buzz.js` に `sendTelegramAlert()` を追加。JSONが見つからない場合（Routine失敗 or Cron未実行）にTelegramへエラー通知を送るよう修正（commit: 9d2efec）。

**防止ルール**:
- Vercel Cron が未実行の場合でも、次回 Cron 発火時に「JSONなし」エラーとしてTelegram通知が届くため検知できる。
- 8:30 JST を過ぎても通知が来ない場合は、手動で `curl -X POST "https://claudeautomationhub.vercel.app/api/process-buzz?date=YYYY-MM-DD" -H "Authorization: Bearer <CRON_SECRET>"` で補完できる。
- また、`api/process-buzz.js` の二重fetchバグ（`fetch(jsonUrl)` を2回呼ぶ）を同時に修正済み。

---

## 2026-04-27: Routine依存タスクは Environment の GH_TOKEN 期限を要監視

**事象**: X-buzz投稿生成（trig_017LyrzBCaqNUiEcn6XA4Hft）が4/27の朝に失敗。Routineセッションは正常に発火しJSON生成・ローカルcommit（7cc4dfa）まで完了したが、`git push` が GH_TOKEN 未設定で失敗。下流の Vercel Cron（/api/process-buzz）はGitHub Raw URLからJSONを取得できず404、結果としてSupabase保存・メール・Telegram通知すべて停止。

**根本原因**: claude-automation-hub の Routine Environment に登録された GH_TOKEN が失効/未設定。セッション内で利用可能なすべての認証方法（セッショントークン、CODESIGNトークン、ベーシック認証）が拒否された。

**防止ルール**:
- git push を含む Routine タスクは、Environment の GH_TOKEN を **PAT有効期限の1週間前までに更新する** こと。
- PAT は `repo` スコープ必須。期限切れ前のリマインダーをカレンダーに登録する。
- 監視: 連続2日 Telegram 通知が来ない場合は Routine ログと最新コミットの push 状態を確認する。
- バックアップ: GitHub Actions の fire-xbuzz.yml も再有効化を検討（ROUTINES_FIRE_URL / ROUTINES_FIRE_TOKEN secrets が空のため現状機能していない）。

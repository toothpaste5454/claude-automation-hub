# Lessons

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

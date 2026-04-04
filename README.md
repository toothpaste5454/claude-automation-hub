# Claude Automation Hub

Claude Code Scheduleを使った自動化ハブ。1時間ごとに実行され、CLAUDE.mdの指示に従って定期タスクを処理する。

## アーキテクチャ

```
Claude Code Schedule（1時間ごと）
    ↓ CLAUDE.md を読む
claude-automation-hub リポジトリ
    ↓ 現在時刻（JST）を判断
    ├─ Livex物件チェック（9時・15時・21時）
    │       ↓ WebFetch
    │   Livexサイト → フィルタ → Vercel APIでメール送信
    └─ （将来追加予定）
```

## リポジトリ情報

- GitHub: https://github.com/toothpaste5454/claude-automation-hub（Private）
- Vercel: https://claudeautomationhub.vercel.app
- Schedule管理: https://claude.ai/code/scheduled/trig_01TPefseAFD7n7cQWkMwmqEZ

## 構成ファイル

| ファイル | 役割 |
|---|---|
| `CLAUDE.md` | Scheduleが読む指示書（全タスク記載） |
| `api/send-email.js` | Vercel Serverless Function（Gmail送信） |
| `state/livex.json` | Livex物件の既知状態（Scheduleが更新） |
| `vercel.json` | Vercel設定 |

## Vercel環境変数

| 変数名 | 用途 |
|---|---|
| `GMAIL_USER` | toothbrush54545@gmail.com（送信元） |
| `GMAIL_APP_PASSWORD` | Gmailアプリパスワード |
| `TO_EMAIL` | toothbrush54545@gmail.com（受取先） |
| `CRON_SECRET` | Schedule→API認証キー |

## Schedule設定

- **ID**: trig_01TPefseAFD7n7cQWkMwmqEZ
- **頻度**: 1時間ごと（`0 * * * *`）
- **残り枠**: 2本（最大3本）

## タスク一覧

### タスク1：Livex物件チェック
- **実行時刻**: 9時・15時・21時（JST）
- **元プロジェクト**: `toothpaste5454/livex-notify`（GitHub Actions削除済み）
- **フィルタ条件**: 指定18エリア・65〜120坪・坪単価10,000円以下
- **通知先**: toothbrush54545@gmail.com

## 新タスクの追加方法

`CLAUDE.md` に新セクションを追記してGitHubにpushするだけ。再デプロイ不要。

```markdown
## タスクN：タスク名
**実行時刻**: XX時（JST）

### 手順
1. ...
```

## ローカルパス

`/Users/hidekioka/claude/ai-management/projects/claude_automation_hub/`

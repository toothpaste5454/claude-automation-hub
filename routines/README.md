# Routines 管理ガイド

Claude Code Routines（クラウドスケジューリング）で自動タスクを管理する。
旧RemoteTriggerは凍結バグ（GitHub Issue #42662）のため廃止。

---

## 環境設定（共通）

claude.ai/code/routines の Environment 設定で「automation-hub」環境を作成し、以下の環境変数を登録する。
全ルーティンはこの環境を共有する。

| 変数名 | 用途 | 値の取得先 |
|---|---|---|
| `GEMINI_API_KEY` | Gemini 2.5 Flash Lite テキスト生成 | Google AI Studio |
| `SUPABASE_URL` | Supabase REST API接続 | Supabase Dashboard |
| `SUPABASE_ANON_KEY` | Supabase認証 | Supabase Dashboard |
| `CRON_SECRET` | Vercel APIエンドポイント認証 | Vercel環境変数 |
| `TELEGRAM_ENDPOINT` | Telegram通知エンドポイント | 固定値（下記） |
| `BUZZ_ENDPOINT` | X-buzz通知エンドポイント | 固定値（下記） |
| `EMAIL_ENDPOINT` | メール通知エンドポイント | 固定値（下記） |

**固定値エンドポイント:**
- `TELEGRAM_ENDPOINT`: `https://claudeautomationhub.vercel.app/api/send-telegram`
- `BUZZ_ENDPOINT`: `https://claudeautomationhub.vercel.app/api/send-buzz-notification`
- `EMAIL_ENDPOINT`: `https://claudeautomationhub.vercel.app/api/send-email`

---

## 稼働中のルーティン

| 名前 | スケジュール (JST) | プロンプトファイル | リポジトリ |
|---|---|---|---|
| Task2: X-buzz投稿生成 | 毎日 8:00 | `task2_xbuzz.md` | なし |
| Task1: Livex物件チェック (9時) | 毎日 9:00 | `task1_livex.md` | claude-automation-hub |
| Task1: Livex物件チェック (15時) | 毎日 15:00 | `task1_livex.md` | claude-automation-hub |
| Task1: Livex物件チェック (21時) | 毎日 21:00 | `task1_livex.md` | claude-automation-hub |

---

## 新しいルーティンの追加手順

### 1. プロンプトファイルを作成

`routines/` ディレクトリに以下のフォーマットで `.md` ファイルを作成する：

```markdown
# [タスク名]

## 概要
何をするタスクか1〜2行で説明。

## 使用する環境変数
- `$VARIABLE_NAME` — 用途

## 手順

### ステップ1: [ステップ名]
具体的な操作手順。curlコマンド例を含める。

### ステップ2: [ステップ名]
...

## エラー処理
- API 503/429 → 10秒待ち × 最大3回リトライ
- 失敗したらスキップして次のステップへ

## 通知
Telegram通知のフォーマットと条件。

## 注意事項
- 使用禁止のツール・モデル等
```

### 2. claude.ai/code/routines でルーティン作成

1. [claude.ai/code/routines](https://claude.ai/code/routines) にアクセス
2. 「New routine」をクリック
3. プロンプトファイルの内容を貼り付け
4. 環境: 「automation-hub」を選択
5. スケジュール: cron式またはプリセットを設定
6. リポジトリ: 必要な場合のみ追加
7. 保存

### 3. このREADMEの「稼働中のルーティン」テーブルを更新

---

## プロンプト作成のルール

1. **環境変数で参照**: 秘密情報はプロンプトに書かず `$ENV_VAR` で参照する
2. **Bash + curl**: 認証ヘッダーが必要なAPIコールは必ず `curl` を使う
3. **Geminiモデル**: `gemini-2.5-flash-lite` を使用（2.5-flashは503頻発、2.0-flashはquota制限）
4. **リトライ**: 外部API呼び出しには10秒待ち×3回のリトライを入れる
5. **通知**: 処理完了時に必ずTelegram通知を送る（成功・失敗どちらも）
6. **自己完結**: プロンプトだけで全手順が実行できること（CLAUDE.md参照に依存しない）

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| ルーティンが実行されない | スケジュール設定ミス / 日次上限超過 | claude.ai/code/routines で状態確認 |
| API 401エラー | 環境変数の値が間違い | Environment設定を確認 |
| Gemini 503エラー | モデル高負荷 | gemini-2.5-flash-lite に変更 |
| Supabaseエラー | プロジェクト休止中 | Supabase Dashboard で restore |
| Telegram通知なし | CRON_SECRET不一致 | Vercel環境変数と一致しているか確認 |

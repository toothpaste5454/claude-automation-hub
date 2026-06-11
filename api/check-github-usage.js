module.exports = async function handler(req, res) {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const ghToken = process.env.GH_TOKEN
  if (!ghToken) {
    return res.status(500).json({ error: 'GH_TOKEN not configured' })
  }

  // GitHub Billing API で当月の使用量を取得
  const billingRes = await fetch(
    'https://api.github.com/users/toothpaste5454/settings/billing/usage',
    {
      headers: {
        Authorization: `Bearer ${ghToken}`,
        Accept: 'application/vnd.github+json',
      },
    }
  )

  if (!billingRes.ok) {
    return res.status(500).json({ error: 'GitHub API error', status: billingRes.status })
  }

  const billing = await billingRes.json()

  // 当月のActions使用分数を集計
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const actionsMinutes = (billing.usageItems || [])
    .filter(item => item.product === 'actions' && item.date.startsWith(currentMonth))
    .reduce((sum, item) => sum + item.quantity, 0)

  const LIMIT = 2000
  const percent = Math.round((actionsMinutes / LIMIT) * 100)

  // 使用率に応じてアイコンを変える
  const icon = percent >= 90 ? '🔴' : percent >= 70 ? '🟡' : '🟢'

  const text = `${icon} *GitHub Actions 使用量レポート*\n\n${actionsMinutes} 分 / ${LIMIT} 分 (${percent}%)\nリセット: 毎月1日`

  // Telegram送信
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  })

  return res.status(200).json({ ok: true, actionsMinutes, percent })
}

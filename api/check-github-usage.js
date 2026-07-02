async function sendTelegramAlert(text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!botToken || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    })
  } catch (e) {
    console.error('Telegram alert error:', e.message)
  }
}

module.exports = async function handler(req, res) {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const ghToken = process.env.GH_TOKEN
  if (!ghToken) {
    return res.status(500).json({ error: 'GH_TOKEN not configured' })
  }

  // GitHub Billing API で当月の使用量を取得
  let billing
  try {
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
      await sendTelegramAlert(`⚠️ *GitHub Actions 使用量チェックエラー*\n\nGitHub APIの取得に失敗しました（HTTP ${billingRes.status}）。`)
      return res.status(500).json({ error: 'GitHub API error', status: billingRes.status })
    }
    billing = await billingRes.json()
  } catch (e) {
    await sendTelegramAlert(`⚠️ *GitHub Actions 使用量チェックエラー*\n\nGitHub APIの取得に失敗しました。\n${e.message}`)
    return res.status(500).json({ error: 'Failed to fetch GitHub billing', detail: e.message })
  }

  // 当月のActions使用分数を集計
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const usedMinutes = (billing.usageItems || [])
    .filter(item => item.product === 'actions' && item.date.startsWith(currentMonth))
    .reduce((sum, item) => sum + item.quantity, 0)

  const LIMIT = 2000
  const remainingMinutes = LIMIT - usedMinutes
  const percentUsed = Math.round((usedMinutes / LIMIT) * 100)

  // 使用率に応じてアイコンを変える
  const icon = percentUsed >= 90 ? '🔴' : percentUsed >= 70 ? '🟡' : '🟢'

  const text = `${icon} *GitHub Actions 残り利用可能時間*\n\n残り: ${remainingMinutes} 分 / ${LIMIT} 分\n使用済み: ${usedMinutes} 分 (${percentUsed}%)\nリセット: 毎月1日`

  await sendTelegramAlert(text)

  return res.status(200).json({ ok: true, usedMinutes, remainingMinutes, percentUsed })
}

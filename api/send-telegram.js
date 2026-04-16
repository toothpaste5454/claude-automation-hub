module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { text, parse_mode } = req.body

  if (!text) {
    return res.status(400).json({ error: 'text is required' })
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    return res.status(500).json({ error: 'Telegram credentials not configured' })
  }

  const telegramRes = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parse_mode || 'Markdown',
      }),
    }
  )

  const data = await telegramRes.json()

  if (!telegramRes.ok) {
    return res.status(500).json({ error: 'Telegram API error', detail: data })
  }

  return res.status(200).json({ ok: true })
}

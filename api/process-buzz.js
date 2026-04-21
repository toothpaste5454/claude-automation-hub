const nodemailer = require('nodemailer')

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/toothpaste5454/claude-automation-hub/main/output'

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // 日付（クエリパラメータ優先、なければJST今日）
  let dateStr = req.query.date
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const now = new Date()
    const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    dateStr = jst.toISOString().slice(0, 10)
  }

  // GitHub Raw URLからJSONを取得
  const jsonUrl = `${GITHUB_RAW_BASE}/buzz_${dateStr}.json`
  let data
  try {
    const fetchRes = await fetch(jsonUrl)
    if (!fetchRes.ok) {
      return res.status(404).json({ error: `JSON not found: buzz_${dateStr}.json`, status: fetchRes.status })
    }
    data = await fetch(jsonUrl).then(r => r.json())
  } catch (e) {
    return res.status(500).json({ error: 'Failed to fetch JSON from GitHub', detail: e.message })
  }

  const { topics, posts } = data
  if (!topics || !posts) {
    return res.status(400).json({ error: 'Invalid JSON format: topics and posts required' })
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials not configured' })
  }

  const supabaseHeaders = {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  }

  // research_topics に保存
  let researchSaved = 0
  for (const topic of topics) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/research_topics`, {
        method: 'POST',
        headers: supabaseHeaders,
        body: JSON.stringify({
          title: topic.source === 'international' ? `【海外】${topic.title}` : topic.title,
          summary: topic.summary || '',
          url: topic.url || '',
          genre: topic.source === 'international' ? 'AI/テクノロジー（海外）' : 'AI/テクノロジー',
          researched_at: dateStr,
        }),
      })
      if (r.ok) researchSaved++
    } catch (e) {
      console.error('research_topics insert error:', e.message)
    }
  }

  // buzz_posts に保存
  let postsSaved = 0
  for (const post of posts) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/buzz_posts`, {
        method: 'POST',
        headers: supabaseHeaders,
        body: JSON.stringify({
          text: post.text,
          source_url: post.source_url || '',
          source_title: post.source_title || '',
          status: 'ready',
        }),
      })
      if (r.ok) postsSaved++
    } catch (e) {
      console.error('buzz_posts insert error:', e.message)
    }
  }

  // メール通知
  try {
    const cardsHtml = posts.map((p, i) => `
      <div style="border:1px solid #ddd;border-radius:8px;padding:16px;margin-bottom:16px;background:#f9f9f9;">
        <div style="font-size:13px;color:#888;margin-bottom:8px;">#${i + 1}</div>
        <p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#222;">${p.text}</p>
        ${p.source_url ? `<a href="${p.source_url}" style="color:#1a73e8;font-size:12px;text-decoration:none;">📰 ${p.source_title || p.source_url}</a>` : ''}
      </div>
    `).join('')

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#333;">今日のXバズ投稿案 ${posts.length}件</h2>
        <p style="color:#666;font-size:14px;">リサーチ件数: ${topics.length}件 | 生成日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
        ${cardsHtml}
        <p style="color:#aaa;font-size:12px;margin-top:24px;">Xバズポストツールで確認・編集してからXに投稿してください。</p>
      </div>
    `

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    })

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: process.env.TO_EMAIL,
      subject: `【Xバズ投稿】今日の投稿案 ${posts.length}件 (${dateStr})`,
      html,
    })
  } catch (e) {
    console.error('Email send error:', e.message)
  }

  // Telegram通知
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (botToken && chatId) {
      const preview1 = posts[0] ? posts[0].text.slice(0, 80) : ''
      const preview2 = posts[1] ? posts[1].text.slice(0, 80) : ''
      const telegramText = `📢 *今日のXバズ投稿 生成完了*\n\n${postsSaved}件生成しました。\n\n▼ 投稿例1\n${preview1}...\n\n▼ 投稿例2\n${preview2}...\n\nブラウザUIで確認してください。`

      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: telegramText,
          parse_mode: 'Markdown',
        }),
      })
    }
  } catch (e) {
    console.error('Telegram send error:', e.message)
  }

  return res.status(200).json({
    ok: true,
    date: dateStr,
    research: researchSaved,
    posts: postsSaved,
  })
}

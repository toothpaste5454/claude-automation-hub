const nodemailer = require('nodemailer')

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/toothpaste5454/claude-automation-hub/main/output'

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
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Vercel Cron は Authorization: Bearer <CRON_SECRET> を送る。
  // 手動 curl 用の x-cron-secret も互換維持する。
  const cronSecret = process.env.CRON_SECRET
  const bearerOk = req.headers['authorization'] === `Bearer ${cronSecret}`
  const customOk = req.headers['x-cron-secret'] === cronSecret
  if (!bearerOk && !customOk) {
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
      await sendTelegramAlert(
        `⚠️ *process-buzz エラー*\n\nbuzz_${dateStr}.json が GitHub に見つかりません（HTTP ${fetchRes.status}）。\nRoutine の git push が失敗した可能性があります。`
      )
      return res.status(404).json({ error: `JSON not found: buzz_${dateStr}.json`, status: fetchRes.status })
    }
    data = await fetchRes.json()
  } catch (e) {
    await sendTelegramAlert(`⚠️ *process-buzz エラー*\n\nGitHub からの JSON 取得に失敗しました。\n${e.message}`)
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

  // スレッド自動生成
  let threadSaved = false
  let threadError = null
  try {
    const geminiKey = process.env.GEMINI_API_KEY
    if (geminiKey && topics.length > 0) {
      const threadTopic = topics.find(t => !t.source || t.source !== 'international') || topics[0]
      const prompt = `あなたはXでバズるスレッド投稿を作るプロです。
以下のトピックについて、Xのスレッド（連続ツイート）形式で投稿文を作成してください。

トピック: ${threadTopic.title}
${threadTopic.url ? `URL: ${threadTopic.url}` : ''}
${threadTopic.summary ? `概要: ${threadTopic.summary}` : ''}

【スレッド構成（この順番で必ず作成）】
スレッド全体が「問い→答え→深掘り」の流れでひとつの連続した話になるようにすること。

1. フック: 「これのすごいところは↓」「これで◯◯がこう変わる↓」「知らないと損する◯◯がついに↓」など次のツイートを見たくなるフレーズで必ず締めること。また文中にソースURLを必ず含めること（URLの後に続けてテキストを書いてよい）。改行は使わず1行で書くこと。
2. 何が変わるのか→: 文頭に「何が変わるのか→」と入れ、「今まで〇〇だったのが、△△になる」のBefore→After形式で変化を明示。文末は「↓」
3. 具体的なメリットは→: 文頭に「具体的なメリットは→」と入れ、時間・コスト・手間の削減を数字や事例を交えて続ける。文末は「↓」
4. できることは→: 文頭に「できることは→」と入れ、機能・活用シーン・具体例をテンポよく列挙する。文末は「↓」
5. 使い方は→: 文頭に「使い方は→」と入れ、始め方・手順・コツをシンプルに伝える
6. 締め: 自然にまとめられる場合のみ追加（無理に入れない）

【ルール】
- 各ツイートは140文字以内（厳守）
- ハッシュタグは使わない
- 「何が変わるのか→」「具体的なメリットは→」のような文頭ラベルは必ず入れ、前のツイートの続きとして読めるようにする
- 日本語で作成

必ずJSON形式のみで返答してください（説明文不要）:
{"tweets": ["ツイート1", "ツイート2", "ツイート3", "ツイート4", "ツイート5"]}`

      let threadTweets = null
      for (let attempt = 1; attempt <= 3; attempt++) {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.9, maxOutputTokens: 1500, responseMimeType: 'application/json' },
            }),
          }
        )
        if (!geminiRes.ok) {
          if ((geminiRes.status === 503 || geminiRes.status === 429) && attempt < 3) {
            await new Promise(r => setTimeout(r, 10000))
            continue
          }
          break
        }
        const geminiData = await geminiRes.json()
        const raw = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
        const parsed = JSON.parse(raw)
        if (parsed.tweets && parsed.tweets.length > 0) { threadTweets = parsed.tweets; break }
        break
      }

      if (threadTweets) {
        const insertRes = await fetch(`${supabaseUrl}/rest/v1/threads`, {
          method: 'POST',
          headers: { ...supabaseHeaders, 'Prefer': 'return=minimal' },
          body: JSON.stringify({ topic: threadTopic.title, tweets: threadTweets, status: 'saved' }),
        })
        threadSaved = insertRes.ok
      }
    }
  } catch (e) {
    console.error('Thread generation error:', e.message)
    threadError = e.message
  }

  // Telegram通知
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    if (botToken && chatId) {
      const preview1 = posts[0] ? posts[0].text.slice(0, 80) : ''
      const preview2 = posts[1] ? posts[1].text.slice(0, 80) : ''
      const telegramText = `📢 *今日のXバズ投稿 生成完了*\n\n${postsSaved}件生成しました。\n${threadSaved ? '🧵 スレッドも自動生成しました。' : ''}\n\n▼ 投稿例1\n${preview1}...\n\n▼ 投稿例2\n${preview2}...\n\nブラウザUIで確認してください。`

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
    thread: threadSaved,
    threadError,
  })
}

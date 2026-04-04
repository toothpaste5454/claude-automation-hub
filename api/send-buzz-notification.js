const nodemailer = require('nodemailer')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { posts, researchCount } = req.body

  if (!posts || posts.length === 0) {
    return res.status(400).json({ error: 'No posts provided' })
  }

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
      <p style="color:#666;font-size:14px;">リサーチ件数: ${researchCount || posts.length}件 | 生成日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
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
    subject: `【Xバズ投稿】今日の投稿案 ${posts.length}件 (${new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' })})`,
    html,
  })

  return res.status(200).json({ ok: true, sent: posts.length })
}

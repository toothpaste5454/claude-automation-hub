const nodemailer = require('nodemailer')

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { subject, properties } = req.body

  if (!properties || properties.length === 0) {
    return res.status(400).json({ error: 'No properties provided' })
  }

  const cardsHtml = properties.map((p) => `
    <div style="border:1px solid #ddd;border-radius:8px;padding:16px;margin-bottom:16px;">
      <h3 style="margin:0 0 12px;font-size:16px;">
        <a href="${p.url}" style="color:#1a73e8;text-decoration:none;">${p.name}</a>
      </h3>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="padding:4px 8px;color:#666;width:80px;">エリア</td><td style="padding:4px 8px;">${p.area}</td></tr>
        <tr><td style="padding:4px 8px;color:#666;">所在地</td>
            <td style="padding:4px 8px;">
              <a href="https://www.google.com/maps/search/${encodeURIComponent(p.address)}" style="color:#1a73e8;">${p.address}</a>
            </td></tr>
        <tr><td style="padding:4px 8px;color:#666;">面積</td><td style="padding:4px 8px;">${p.tsubo}</td></tr>
        <tr><td style="padding:4px 8px;color:#666;">坪単価</td><td style="padding:4px 8px;">${p.price_per_tsubo}</td></tr>
        <tr><td style="padding:4px 8px;color:#666;">月額賃料</td><td style="padding:4px 8px;">${p.monthly_rent}</td></tr>
      </table>
    </div>
  `).join('')

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#333;">新着物件 ${properties.length}件</h2>
      ${cardsHtml}
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
    subject,
    html,
  })

  return res.status(200).json({ ok: true, sent: properties.length })
}

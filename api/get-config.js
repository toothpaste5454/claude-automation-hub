module.exports = function handler(req, res) {
  const secret = req.headers['x-cron-secret'];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  res.status(200).json({
    telegram_bot_token: (process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    telegram_chat_id: (process.env.TELEGRAM_CHAT_ID || '').trim(),
    gemini_api_key: (process.env.GEMINI_API_KEY || '').trim(),
    supabase_url: (process.env.SUPABASE_URL || '').trim(),
    supabase_anon_key: (process.env.SUPABASE_ANON_KEY || '').trim(),
    email_endpoint: 'https://claudeautomationhub.vercel.app/api/send-email',
    buzz_endpoint: 'https://claudeautomationhub.vercel.app/api/send-buzz-notification',
  });
}

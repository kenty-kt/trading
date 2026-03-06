module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, description, tokens, lang = 'en' } = req.body;

  const tokenInfo = tokens && tokens.length
    ? tokens.map(t => `${t.symbol}: $${t.price?.toLocaleString()} (24h: ${t.change24h?.toFixed(2)}%)`).join(', ')
    : 'No specific tokens identified';

  const langInstruction = lang === 'zh'
    ? 'Respond in Simplified Chinese.'
    : 'Respond in English.';

  const prompt = `You are a professional market analyst covering crypto AND macro assets. Analyze the following news and provide trading insights. ${langInstruction}

News Title: ${title}
Summary: ${description}
Related Tokens: ${tokenInfo}

Macro assets available for correlation analysis: Gold (GC=F), Crude Oil (CL=F), Silver (SI=F), S&P 500 (SPY), Nasdaq (QQQ), USD Index (DX-Y.NYB), 10Y Yield (TNX), NVIDIA (NVDA).

Provide a JSON response with this exact structure:
{
  "signal": "bullish|bearish|neutral",
  "interpretation": "2-3 sentence market signal interpretation",
  "recommendations": [
    {
      "symbol": "TOKEN",
      "action": "Long|Short",
      "entry": "price or range",
      "tp": "take profit price",
      "sl": "stop loss price",
      "rr": "risk/reward ratio like 1:2.5",
      "reasoning": "brief reason"
    }
  ],
  "relatedAssets": [
    { "symbol": "GC=F", "name": "Gold", "reason": "why this macro asset is relevant" }
  ],
  "assetNote": "One sentence explaining macro asset correlations with this news"
}

Only include tokens mentioned in the news for recommendations (max 3). For relatedAssets, include 1-3 macro assets most relevant to this news event. Be concise and professional.`;

  try {
    const aiRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.3,
      }),
    });

    const data = await aiRes.json();
    const content = data.choices?.[0]?.message?.content;
    const analysis = JSON.parse(content);
    res.json(analysis);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

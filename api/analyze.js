export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { title, description, tokens } = req.body;

  const tokenInfo = tokens && tokens.length
    ? tokens.map(t => `${t.symbol}: $${t.price?.toLocaleString()} (24h: ${t.change24h?.toFixed(2)}%)`).join(', ')
    : 'No specific tokens identified';

  const prompt = `You are a professional crypto market analyst. Analyze the following news and provide trading insights.

News Title: ${title}
Summary: ${description}
Related Tokens: ${tokenInfo}

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
  ]
}

Only include tokens mentioned in the news. Maximum 3 recommendations. Be concise and professional.`;

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
}

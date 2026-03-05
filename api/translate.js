module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { texts } = req.body;
  if (!texts || !Array.isArray(texts)) {
    return res.status(400).json({ error: 'texts array required' });
  }

  try {
    const prompt = `Translate the following English texts to Simplified Chinese. Return a JSON array of translated strings in the same order. Keep proper nouns, numbers, and symbols unchanged. Only return the JSON array, no explanation.\n\n${JSON.stringify(texts)}`;

    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    const data = await r.json();
    const content = data.choices?.[0]?.message?.content;
    const parsed = JSON.parse(content);
    // 支持 {translations: [...]} 或直接数组
    const result = Array.isArray(parsed) ? parsed : (parsed.translations || parsed.result || Object.values(parsed));
    res.json({ translations: result });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

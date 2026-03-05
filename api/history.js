const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { symbol = 'BTCUSDT', from, to } = req.query;
  const startMs = parseInt(from) * 1000;
  const endMs = parseInt(to) * 1000;

  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=4h&startTime=${startMs}&endTime=${endMs}&limit=24`;
    const data = await httpsGet(url);

    if (!Array.isArray(data)) {
      return res.status(500).json({ error: 'Invalid response from Binance', raw: data });
    }

    const candles = data.map(k => ({
      t: k[0],
      o: parseFloat(k[1]),
      h: parseFloat(k[2]),
      l: parseFloat(k[3]),
      c: parseFloat(k[4]),
    }));

    const first = candles[0]?.c || 1;
    const last = candles[candles.length - 1]?.c || 1;
    const change = ((last - first) / first * 100).toFixed(2);

    res.json({ candles, change, symbol });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

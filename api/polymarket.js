const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('Parse error: ' + data.slice(0,100))); } });
    }).on('error', reject);
  });
}

// 关键词映射：token -> Polymarket 搜索词
const TOKEN_KEYWORDS = {
  'BTC':  ['bitcoin', 'BTC price'],
  'ETH':  ['ethereum', 'ETH price'],
  'SOL':  ['solana', 'SOL price'],
  'BNB':  ['BNB', 'binance coin'],
  'TRX':  ['TRON', 'TRX'],
  'DOGE': ['dogecoin', 'DOGE'],
  'WIF':  ['dogwifhat', 'WIF'],
  'BONK': ['BONK', 'bonk'],
  'JUP':  ['Jupiter', 'JUP'],
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbols } = req.query; // comma-separated: BTC,ETH,SOL
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());
  const results = [];

  for (const symbol of symbolList) {
    const keywords = TOKEN_KEYWORDS[symbol] || [symbol.toLowerCase()];
    const query = encodeURIComponent(keywords[0]);

    try {
      // Polymarket Gamma API - search markets
      const markets = await httpsGet(
        `https://gamma-api.polymarket.com/markets?search=${query}&active=true&closed=false&limit=5&order=liquidityNum&ascending=false`
      );

      const relevant = (Array.isArray(markets) ? markets : [])
        .filter(m => m.liquidity > 100) // 过滤低流动性
        .slice(0, 3)
        .map(m => {
          // outcomes 可能是 JSON string
          let outcomes = [];
          let outcomePrices = [];
          try {
            outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || []);
            outcomePrices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || []);
          } catch(e) {}

          return {
            id: m.id,
            slug: m.slug,
            question: m.question,
            endDate: m.endDate,
            liquidity: Math.round(m.liquidityNum || m.liquidity || 0),
            volume: Math.round(m.volumeNum || m.volume || 0),
            outcomes: outcomes.map((o, i) => ({
              name: o,
              price: outcomePrices[i] ? parseFloat(outcomePrices[i]).toFixed(3) : null,
              probability: outcomePrices[i] ? (parseFloat(outcomePrices[i]) * 100).toFixed(1) + '%' : 'N/A',
            })),
            url: `https://polymarket.com/market/${m.slug}`,
          };
        });

      results.push({ symbol, markets: relevant });
    } catch(e) {
      results.push({ symbol, markets: [], error: e.message });
    }
  }

  res.json({ results });
};

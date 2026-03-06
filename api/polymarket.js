const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error('Parse error: ' + data.slice(0, 100))); }
      });
    }).on('error', reject);
  });
}

// token 名称关键词（用于匹配市场标题）
const TOKEN_KEYWORDS = {
  'BTC':  ['bitcoin', 'btc'],
  'ETH':  ['ethereum', 'eth'],
  'SOL':  ['solana', 'sol'],
  'BNB':  ['bnb', 'binance coin'],
  'TRX':  ['tron', 'trx'],
  'XRP':  ['xrp', 'ripple'],
  'DOGE': ['dogecoin', 'doge'],
  'WIF':  ['dogwifhat', 'wif'],
  'BONK': ['bonk'],
  'JUP':  ['jupiter', 'jup'],
  'AVAX': ['avalanche', 'avax'],
  'LINK': ['chainlink', 'link'],
  'DOT':  ['polkadot', 'dot'],
  'ADA':  ['cardano', 'ada'],
};

// 对冲相关优先词（高优先级）
const HEDGE_PRIORITY_WORDS = [
  'up or down', 'above', 'below', 'reach', 'hit', 'price', 'dip', 'crash',
  'higher', 'lower', 'end of', 'by end', 'ath', 'all-time high'
];

let cachedMarkets = null;
let cacheTime = 0;

async function fetchAllMarkets() {
  // 缓存5分钟
  if (cachedMarkets && Date.now() - cacheTime < 5 * 60 * 1000) {
    return cachedMarkets;
  }
  const data = await httpsGet(
    'https://gamma-api.polymarket.com/markets?active=true&closed=false&limit=500&order=liquidityNum&ascending=false'
  );
  cachedMarkets = Array.isArray(data) ? data : [];
  cacheTime = Date.now();
  return cachedMarkets;
}

function parseMarket(m) {
  let outcomes = [];
  let outcomePrices = [];
  try {
    outcomes = typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || []);
    outcomePrices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || []);
  } catch(e) {}

  const endDate = m.endDate
    ? new Date(m.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—';

  return {
    id: m.id,
    slug: m.slug,
    question: m.question,
    endDate,
    liquidity: Math.round(m.liquidityNum || m.liquidity || 0),
    volume: Math.round(m.volumeNum || m.volume || 0),
    outcomes: outcomes.map((o, i) => ({
      name: o,
      price: outcomePrices[i] ? parseFloat(outcomePrices[i]) : null,
      probability: outcomePrices[i]
        ? (parseFloat(outcomePrices[i]) * 100).toFixed(1) + '%'
        : 'N/A',
    })),
    url: `https://polymarket.com/market/${m.slug}`,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { symbols } = req.query;
  if (!symbols) return res.status(400).json({ error: 'symbols required' });

  const symbolList = symbols.split(',').map(s => s.trim().toUpperCase());

  try {
    const allMarkets = await fetchAllMarkets();
    const results = [];

    for (const symbol of symbolList) {
      const keywords = TOKEN_KEYWORDS[symbol] || [symbol.toLowerCase()];

      // 1. 筛选包含 token 关键词的市场
      const tokenMarkets = allMarkets.filter(m => {
        const q = (m.question || '').toLowerCase();
        return keywords.some(kw => q.includes(kw));
      });

      // 2. 评分：优先价格方向类
      const scored = tokenMarkets.map(m => {
        const q = (m.question || '').toLowerCase();
        const hedgeScore = HEDGE_PRIORITY_WORDS.filter(w => q.includes(w)).length;
        return { m, score: hedgeScore * 1000 + (m.liquidityNum || 0) };
      });

      // 3. 按分数排序，取前4
      scored.sort((a, b) => b.score - a.score);
      const top = scored.slice(0, 4).map(s => parseMarket(s.m));

      results.push({ symbol, markets: top });
    }

    res.json({ results });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

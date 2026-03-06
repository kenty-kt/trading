// api/watchlist.js — 拉取多资产报价（Yahoo Finance）
const https = require('https');

// 默认关注列表：宏观资产
const DEFAULT_SYMBOLS = [
  { symbol: 'GC=F',    name: 'Gold',       type: 'commodity', emoji: '🥇' },
  { symbol: 'CL=F',    name: 'Crude Oil',  type: 'commodity', emoji: '🛢️' },
  { symbol: 'SI=F',    name: 'Silver',     type: 'commodity', emoji: '🪙' },
  { symbol: 'SPY',     name: 'S&P 500',    type: 'equity',    emoji: '📈' },
  { symbol: 'QQQ',     name: 'Nasdaq',     type: 'equity',    emoji: '💻' },
  { symbol: 'DX-Y.NYB',name: 'USD Index',  type: 'fx',        emoji: '💵' },
  { symbol: 'TNX',     name: '10Y Yield',  type: 'bond',      emoji: '🏦' },
  { symbol: 'NVDA',    name: 'NVIDIA',     type: 'equity',    emoji: '🤖' },
];

let cache = null;
let cacheTs = 0;
const CACHE_TTL = 60 * 1000; // 1min

function fetchYahoo(symbol) {
  return new Promise((resolve) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const opts = {
      hostname: 'query1.finance.yahoo.com',
      path: `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 5000,
    };
    https.get(opts, (res) => {
      let raw = '';
      res.on('data', d => raw += d);
      res.on('end', () => {
        try {
          const j = JSON.parse(raw);
          const result = j?.chart?.result?.[0];
          if (!result) return resolve(null);
          const meta = result.meta;
          const closes = result.indicators?.quote?.[0]?.close || [];
          const times  = result.timestamp || [];
          // 过滤掉 null
          const valid = closes.map((c, i) => ({ c, t: times[i] })).filter(x => x.c != null);
          const prev  = valid.length >= 2 ? valid[valid.length - 2].c : null;
          const last  = meta.regularMarketPrice || valid[valid.length - 1]?.c;
          const chg   = prev && last ? ((last - prev) / prev) * 100 : 0;
          // 取最近5天收盘价作为 sparkline
          const spark = valid.slice(-5).map(x => x.c);
          resolve({ last, chg, spark, currency: meta.currency || 'USD' });
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null)).on('timeout', () => resolve(null));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (cache && Date.now() - cacheTs < CACHE_TTL) {
    return res.json(cache);
  }

  const results = await Promise.all(
    DEFAULT_SYMBOLS.map(async (item) => {
      const data = await fetchYahoo(item.symbol);
      return {
        ...item,
        price:  data?.last   ?? null,
        change: data?.chg    ?? 0,
        spark:  data?.spark  ?? [],
        currency: data?.currency ?? 'USD',
      };
    })
  );

  cache = { assets: results, updatedAt: Date.now() };
  cacheTs = Date.now();
  res.json(cache);
};

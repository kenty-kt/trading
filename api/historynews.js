// api/historynews.js — 拉取历史时间点附近的新闻
// 使用 CryptoCompare News API（免费，支持 before 时间戳）
const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject).on('timeout', () => reject(new Error('timeout')));
  });
}

// 简单内存缓存
const cache = new Map();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  // ts: 时间戳（秒），symbol: BTC/ETH/SOL 等，limit: 最多几条
  const { ts, symbol = 'BTC', limit = 5 } = req.query;
  if (!ts) return res.status(400).json({ error: 'ts required' });

  const tsNum = parseInt(ts);
  const cacheKey = `${symbol}_${Math.floor(tsNum / 3600)}`; // 按小时缓存
  if (cache.has(cacheKey)) return res.json(cache.get(cacheKey));

  try {
    // CryptoCompare: 拉取 before=ts+1h 的最近50条，过滤时间窗口 ±12H
    const beforeTs = tsNum + 3600;
    const categories = symbol.toUpperCase();
    const url = `https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${categories}&before=${beforeTs}&limit=50`;
    const data = await httpsGet(url);
    const items = data.Data || [];

    // 过滤：在 ts ±12小时内
    const windowSec = 12 * 3600;
    const nearby = items
      .filter(n => Math.abs(n.published_on - tsNum) <= windowSec)
      .slice(0, parseInt(limit))
      .map(n => ({
        title: n.title,
        url: n.url,
        source: n.source,
        publishedAt: n.published_on,
        body: (n.body || '').slice(0, 200),
      }));

    const result = { news: nearby, ts: tsNum, symbol };
    cache.set(cacheKey, result);
    // 缓存10分钟
    setTimeout(() => cache.delete(cacheKey), 10 * 60 * 1000);

    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message, news: [] });
  }
};

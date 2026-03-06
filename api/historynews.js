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

const cache = new Map();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { ts, symbol = 'BTC', limit = 4 } = req.query;
  if (!ts) return res.status(400).json({ error: 'ts required' });

  const tsNum = parseInt(ts);
  const cacheKey = `${symbol}_${Math.floor(tsNum / 3600)}`;
  if (cache.has(cacheKey)) return res.json(cache.get(cacheKey));

  try {
    const categories = symbol.toUpperCase();

    // 并行拉两页：ts 之后1H 和 ts 之前，合并取最近的
    const [r1, r2] = await Promise.allSettled([
      httpsGet(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${categories}&before=${tsNum + 3600}&limit=50`),
      httpsGet(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${categories}&before=${tsNum}&limit=50`),
    ]);

    const items = [
      ...(r1.status === 'fulfilled' ? r1.value.Data || [] : []),
      ...(r2.status === 'fulfilled' ? r2.value.Data || [] : []),
    ];

    // 去重 + 按时间差排序，不限窗口（总能找到最近的）
    const seen = new Set();
    const sorted = items
      .filter(n => { if (seen.has(n.id)) return false; seen.add(n.id); return true; })
      .map(n => ({ ...n, _diff: Math.abs(n.published_on - tsNum) }))
      .sort((a, b) => a._diff - b._diff)
      .slice(0, parseInt(limit));

    const result = {
      news: sorted.map(n => ({
        title: n.title,
        url: n.url,
        source: n.source,
        publishedAt: n.published_on,
        diffHours: Math.round(n._diff / 3600),
      })),
      ts: tsNum,
      symbol,
    };

    cache.set(cacheKey, result);
    setTimeout(() => cache.delete(cacheKey), 10 * 60 * 1000);
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message, news: [] });
  }
};

// api/historynews.js — 拉取历史时间点附近的新闻，按相似度过滤
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

// 提取关键词（去停用词，取有意义的词）
const STOPWORDS = new Set(['the','a','an','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could','should','may','might',
  'to','of','in','on','at','by','for','with','about','as','from','into','through',
  'and','or','but','not','this','that','it','its','he','she','they','we','you','i',
  'after','before','over','under','up','down','out','new','big','what','how','why',
  'bitcoin','btc','crypto','cryptocurrency','market','price','news']);

function extractKeywords(text) {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !STOPWORDS.has(w));
}

function similarityScore(queryWords, title) {
  const titleWords = new Set(extractKeywords(title));
  let matches = 0;
  for (const w of queryWords) {
    // 完整词匹配 or 包含匹配（如 'drop' 匹配 'drops'）
    if (titleWords.has(w) || [...titleWords].some(tw => tw.includes(w) || w.includes(tw))) {
      matches++;
    }
  }
  return matches;
}

const cache = new Map();

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  const { ts, symbol = 'BTC', limit = 3, q = '' } = req.query;
  if (!ts) return res.status(400).json({ error: 'ts required' });

  const tsNum = parseInt(ts);
  const cacheKey = `${symbol}_${Math.floor(tsNum / 3600)}_${q.slice(0,20)}`;
  if (cache.has(cacheKey)) return res.json(cache.get(cacheKey));

  // 提取查询关键词
  const queryWords = extractKeywords(q);

  try {
    const categories = symbol.toUpperCase();

    const [r1, r2] = await Promise.allSettled([
      httpsGet(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${categories}&before=${tsNum + 3600}&limit=50`),
      httpsGet(`https://min-api.cryptocompare.com/data/v2/news/?lang=EN&categories=${categories}&before=${tsNum}&limit=50`),
    ]);

    const items = [
      ...(r1.status === 'fulfilled' ? r1.value.Data || [] : []),
      ...(r2.status === 'fulfilled' ? r2.value.Data || [] : []),
    ];

    // 去重
    const seen = new Set();
    const unique = items.filter(n => {
      if (seen.has(n.id)) return false;
      seen.add(n.id); return true;
    });

    // 如果有查询词，按相似度过滤：只保留至少1个关键词匹配的
    let filtered = unique;
    if (queryWords.length > 0) {
      filtered = unique
        .map(n => ({ ...n, _score: similarityScore(queryWords, n.title) }))
        .filter(n => n._score > 0)
        .sort((a, b) => b._score - a._score || Math.abs(a.published_on - tsNum) - Math.abs(b.published_on - tsNum));
    } else {
      // 无查询词，按时间差排序
      filtered = unique.sort((a, b) =>
        Math.abs(a.published_on - tsNum) - Math.abs(b.published_on - tsNum));
    }

    const top = filtered.slice(0, parseInt(limit));

    const result = {
      news: top.map(n => ({
        title: n.title,
        url: n.url,
        source: n.source,
        publishedAt: n.published_on,
        diffHours: Math.round(Math.abs(n.published_on - tsNum) / 3600),
        score: n._score || 0,
      })),
      queryWords,
      ts: tsNum,
      symbol,
      total: filtered.length,
    };

    cache.set(cacheKey, result);
    setTimeout(() => cache.delete(cacheKey), 10 * 60 * 1000);
    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message, news: [] });
  }
};

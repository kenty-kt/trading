const TOKEN_MAP = {
  'bitcoin': 'bitcoin', 'btc': 'bitcoin',
  'ethereum': 'ethereum', 'eth': 'ethereum',
  'solana': 'solana', 'sol': 'solana',
  'xrp': 'ripple', 'ripple': 'ripple',
  'dogecoin': 'dogecoin', 'doge': 'dogecoin',
  'cardano': 'cardano', 'ada': 'cardano',
  'avalanche': 'avalanche-2', 'avax': 'avalanche-2',
  'polkadot': 'polkadot', 'dot': 'polkadot',
  'chainlink': 'chainlink', 'link': 'chainlink',
  'polygon': 'matic-network', 'matic': 'matic-network',
  'uniswap': 'uniswap', 'uni': 'uniswap',
  'litecoin': 'litecoin', 'ltc': 'litecoin',
  'shiba': 'shiba-inu', 'shib': 'shiba-inu',
  'tron': 'tron', 'trx': 'tron',
  'ton': 'the-open-network',
  'sui': 'sui',
  'pepe': 'pepe',
  'bnb': 'binancecoin', 'binance': 'binancecoin',
};

function extractTokens(title) {
  const lower = title.toLowerCase();
  const found = new Set();
  for (const [keyword, id] of Object.entries(TOKEN_MAP)) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(lower)) found.add(id);
  }
  return [...found];
}

function parseRSS(xml) {
  const items = [];
  // 提取所有 <item>...</item>
  const itemBlocks = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
  for (const block of itemBlocks) {
    const getTag = (tag) => {
      // CDATA
      const cdataMatch = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[(.*?)\\]\\]><\\/${tag}>`, 's'));
      if (cdataMatch) return cdataMatch[1].trim();
      // plain
      const plainMatch = block.match(new RegExp(`<${tag}[^>]*>(.*?)<\\/${tag}>`, 's'));
      if (plainMatch) return plainMatch[1].trim();
      return '';
    };
    const title = getTag('title');
    const link = getTag('link') || block.match(/<link>(.*?)<\/link>/)?.[1]?.trim() || '';
    const pubDate = getTag('pubDate');
    const description = getTag('description').replace(/<[^>]+>/g, '').slice(0, 150) + '...';
    if (title) items.push({ title, link, pubDate, description });
  }
  return items;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const r = await fetch('https://www.coindesk.com/arc/outboundfeeds/rss', {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const xml = await r.text();
    const parsed = parseRSS(xml);

    const items = parsed.map(item => ({
      ...item,
      source: 'CoinDesk',
      tag: 'Crypto',
      tokenIds: extractTokens(item.title),
    }));

    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    const top20 = items.slice(0, 20);

    // CoinGecko 价格
    const allIds = [...new Set(top20.flatMap(i => i.tokenIds))];
    let priceMap = {};
    if (allIds.length > 0) {
      try {
        const cgUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${allIds.join(',')}&order=market_cap_desc&sparkline=false&price_change_percentage=24h`;
        const cgRes = await fetch(cgUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const cgData = await cgRes.json();
        if (Array.isArray(cgData)) {
          cgData.forEach(coin => {
            priceMap[coin.id] = {
              symbol: coin.symbol.toUpperCase(),
              name: coin.name,
              price: coin.current_price,
              change24h: coin.price_change_percentage_24h,
              image: coin.image,
            };
          });
        }
      } catch(e) { /* CoinGecko 失败不影响新闻加载 */ }
    }

    const enriched = top20.map(item => ({
      ...item,
      tokens: item.tokenIds.map(id => priceMap[id]).filter(Boolean),
    }));

    res.json({ items: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
};

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

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const feeds = [
    'https://www.coindesk.com/arc/outboundfeeds/rss'
  ];

  try {
    const results = await Promise.all(feeds.map(async (url) => {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      return r.text();
    }));

    const items = [];
    results.forEach(xml => {
      const titleMatches = xml.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<description><!\[CDATA\[(.*?)\]\]><\/description>[\s\S]*?<\/item>/g);
      for (const m of titleMatches) {
        const title = m[1].trim();
        items.push({
          title,
          link: m[2].trim(),
          pubDate: m[3].trim(),
          description: m[4].trim().replace(/<[^>]+>/g, '').slice(0, 150) + '...',
          source: 'CoinDesk',
          tag: 'Crypto',
          tokenIds: extractTokens(title),
        });
      }
    });

    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    const top20 = items.slice(0, 20);

    const allIds = [...new Set(top20.flatMap(i => i.tokenIds))];

    let priceMap = {};
    if (allIds.length > 0) {
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
    }

    const enriched = top20.map(item => ({
      ...item,
      tokens: item.tokenIds.map(id => priceMap[id]).filter(Boolean),
    }));

    res.json({ items: enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

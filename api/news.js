export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const feeds = [
    'https://www.coindesk.com/arc/outboundfeeds/rss'
  ];

  try {
    const results = await Promise.all(feeds.map(async (url) => {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      return r.text();
    }));

    const items = [];
    results.forEach(xml => {
      const titleMatches = xml.matchAll(/<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<description><!\[CDATA\[(.*?)\]\]><\/description>[\s\S]*?<\/item>/g);
      for (const m of titleMatches) {
        items.push({
          title: m[1].trim(),
          link: m[2].trim(),
          pubDate: m[3].trim(),
          description: m[4].trim().replace(/<[^>]+>/g, '').slice(0, 150) + '...',
          source: 'CoinDesk',
          tag: 'Crypto'
        });
      }
    });

    // 按时间排序，取最新20条
    items.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    
    res.json({ items: items.slice(0, 20) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

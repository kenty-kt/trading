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

// 常用 Solana token mint 地址
const TOKEN_MINTS = {
  'SOL':  'So11111111111111111111111111111111111111112',
  'BTC':  '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E',
  'ETH':  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  'USDC': 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'USDT': 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  'BNB':  '9gP2kCy3wA1ctvYWQk75guqXuzoJcNoD4BSuajWK2RD',
  'XRP':  'Ga7NszFvLMeHWJRziddFgqMKVuLuoqo7PFmLFtCFNKr9',
  'DOGE': 'A9mUU4qviSctJVPJdBJWkb28deg915LYJKrzQ19ji3FM',
  'AVAX': 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS',
  'LINK': 'CWE8jPTUYhdCTZYWPTe1o5DFqfdjzWKc9WKz6rSjnUdR',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { inputMint, outputMint, amount, slippage = 50 } = req.query;

  if (!inputMint || !outputMint || !amount) {
    return res.status(400).json({ error: 'Missing inputMint, outputMint, or amount' });
  }

  try {
    // Jupiter Quote API
    const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippage}`;
    const quote = await httpsGet(url);
    res.json({ quote, tokenMints: TOKEN_MINTS });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

// Solana token list (major tokens with mint addresses)
const KNOWN_TOKENS = {
  'So11111111111111111111111111111111111111112': { symbol: 'SOL', name: 'Solana' },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', name: 'USD Coin' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', name: 'Tether' },
  '9n4nbM75f5Ui33ZbPYXn59EwSgE8CGsHtAeTH5YFeJ9E': { symbol: 'BTC', name: 'Bitcoin (Wormhole)' },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': { symbol: 'ETH', name: 'Ethereum (Wormhole)' },
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263': { symbol: 'BONK', name: 'Bonk' },
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN': { symbol: 'JUP', name: 'Jupiter' },
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm': { symbol: 'WIF', name: 'dogwifhat' },
  'jtojtomepa8bdya54groigiub3omctekcrecipx4gkv': { symbol: 'JTO', name: 'Jito' },
  'HZ1JovNiVvGrCNiiYWY1CzvYhV72fwNjpMont6dZx2hk': { symbol: 'PYTH', name: 'Pyth Network' },
};

// CoinGecko symbol -> id map
const COINGECKO_IDS = {
  'SOL': 'solana', 'BTC': 'bitcoin', 'ETH': 'ethereum',
  'BONK': 'bonk', 'JUP': 'jupiter-exchange-solana',
  'WIF': 'dogwifcoin', 'JTO': 'jito-governance-token',
  'PYTH': 'pyth-network', 'USDC': 'usd-coin', 'USDT': 'tether',
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: 'wallet address required' });

  try {
    // 1. 获取 SOL 余额
    const solReq = await new Promise((resolve, reject) => {
      const body = JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getBalance',
        params: [wallet]
      });
      const options = {
        hostname: 'api.mainnet-beta.solana.com',
        path: '/', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
      };
      const req = https.request(options, (r) => {
        let d = ''; r.on('data', c => d += c);
        r.on('end', () => resolve(JSON.parse(d)));
      });
      req.on('error', reject);
      req.write(body); req.end();
    });
    const solBalance = (solReq.result?.value || 0) / 1e9;

    // 2. 获取 SPL token 余额
    const tokenReq = await new Promise((resolve, reject) => {
      const body = JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'getTokenAccountsByOwner',
        params: [wallet, { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed' }]
      });
      const options = {
        hostname: 'api.mainnet-beta.solana.com',
        path: '/', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length }
      };
      const r = https.request(options, (res) => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => resolve(JSON.parse(d)));
      });
      r.on('error', reject);
      r.write(body); r.end();
    });

    // 3. 解析 token 持仓
    const holdings = [];
    if (solBalance > 0.001) {
      holdings.push({ symbol: 'SOL', name: 'Solana', balance: solBalance, mint: 'native' });
    }

    const accounts = tokenReq.result?.value || [];
    for (const acc of accounts) {
      const info = acc.account?.data?.parsed?.info;
      if (!info) continue;
      const mint = info.mint;
      const amount = parseFloat(info.tokenAmount?.uiAmount || 0);
      if (amount < 0.0001) continue;
      const known = KNOWN_TOKENS[mint];
      if (known) {
        holdings.push({ symbol: known.symbol, name: known.name, balance: amount, mint });
      }
    }

    // 4. 获取价格
    const symbols = holdings.map(h => COINGECKO_IDS[h.symbol]).filter(Boolean);
    let prices = {};
    if (symbols.length) {
      try {
        const cgData = await httpsGet(
          `https://api.coingecko.com/api/v3/simple/price?ids=${symbols.join(',')}&vs_currencies=usd&include_24hr_change=true`
        );
        for (const h of holdings) {
          const id = COINGECKO_IDS[h.symbol];
          if (id && cgData[id]) {
            h.price = cgData[id].usd;
            h.change24h = cgData[id].usd_24h_change;
            h.value = h.balance * h.price;
          }
        }
      } catch(e) {}
    }

    // 过滤掉 stable coins 和无价格数据的（可选）
    const totalValue = holdings.reduce((s, h) => s + (h.value || 0), 0);
    holdings.forEach(h => {
      h.pct = totalValue > 0 ? ((h.value || 0) / totalValue * 100).toFixed(1) : '0';
    });

    res.json({ holdings, totalValue: totalValue.toFixed(2), wallet });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};

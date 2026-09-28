/**
 * Zendrop MCP client. Calls only the documented JSON-RPC endpoint.
 * Tool names for catalog reads are the ones already used by BuyWish.
 * Order placement is discovered at runtime with tools/list and is never guessed.
 */

const https = require('https');

const ZENDROP_TOKEN = process.env.ZENDROP_API_KEY;

function zendropRpc(method, params = {}, { timeoutMs = 12000 } = {}) {
  if (!ZENDROP_TOKEN) return Promise.reject(new Error('Zendrop is not configured. Set ZENDROP_API_KEY.'));
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params
    });
    const req = https.request({
      hostname: 'app.zendrop.com',
      port: 443,
      path: '/mcp/v1',
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ZENDROP_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(d);
          if (parsed.error) return reject(new Error(parsed.error.message || 'Zendrop API error'));
          const content = parsed.result && parsed.result.content;
          if (content && content[0] && content[0].text) {
            try {
              return resolve(JSON.parse(content[0].text));
            } catch (e) {
              return resolve({ text: content[0].text });
            }
          }
          resolve(parsed.result || {});
        } catch (e) {
          reject(new Error('Invalid Zendrop response'));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Zendrop API timeout'));
    });
    req.write(body);
    req.end();
  });
}

function zendropCall(toolName, args = {}, options) {
  return zendropRpc('tools/call', { name: toolName, arguments: args }, options);
}

function zendropListTools(options) {
  return zendropRpc('tools/list', {}, options);
}

module.exports = { zendropRpc, zendropCall, zendropListTools };

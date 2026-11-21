// utils/broker-adapters/base-adapter.js
// Module C: IBrokerApiAdapter Standard Connector Interface
// Every external digital broker API adapter implements:
//   - authenticate()        (OAuth2 client_credentials token caching OR API Key)
//   - fetchAvailableLoads() (returns raw payload array from broker API)
//   - mapToStandardLoad()   (maps broker-specific JSON to LoadsNexus normalized load object)
//   - submitQuoteOrBook()   (submits carrier quote or instant booking back to broker API)

class BaseBrokerAdapter {
  constructor(config = {}) {
    this.key = config.key || 'base';
    this.name = config.name || 'Base Broker Adapter';
    this.brokerMc = config.brokerMc || null;
    this.brokerDot = config.brokerDot || null;
    this.baseUrl = config.baseUrl || '';
    this.authType = config.authType || 'oauth2'; // 'oauth2' | 'api_key' | 'none'
    this.tokenCache = { accessToken: null, expiresAt: 0 };
  }

  isConfigured() {
    return false;
  }

  async authenticate() {
    if (this.authType === 'none') return { ok: true, token: 'mock-token' };
    if (this.tokenCache.accessToken && Date.now() < this.tokenCache.expiresAt - 60000) {
      return { ok: true, token: this.tokenCache.accessToken, cached: true };
    }
    throw new Error(`${this.name}: authenticate() not configured — add partner API credentials in environment variables.`);
  }

  async fetchOAuth2Token({ tokenUrl, clientId, clientSecret, audience, scope }) {
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    });
    if (audience) body.set('audience', audience);
    if (scope) body.set('scope', scope);

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const resp = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: body.toString(),
        signal: ctrl.signal
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.access_token) {
        throw new Error(`${this.name} OAuth2 failed (${resp.status}): ${data.error_description || data.error || 'Invalid credentials'}`);
      }
      const ttlSec = Math.max(60, Number(data.expires_in) || 3600);
      this.tokenCache = {
        accessToken: data.access_token,
        expiresAt: Date.now() + ttlSec * 1000
      };
      return { ok: true, token: data.access_token, expires_in: ttlSec };
    } finally {
      clearTimeout(timer);
    }
  }

  async httpJson(url, opts = {}) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 12000);
    try {
      const resp = await fetch(url, {
        ...opts,
        signal: ctrl.signal,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(opts.headers || {}) }
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(`${this.name} HTTP ${resp.status}: ${data.message || data.error || 'Upstream API error'}`);
      }
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchAvailableLoads() {
    throw new Error(`${this.name}: fetchAvailableLoads() must be implemented by subclass.`);
  }

  mapToStandardLoad(rawPayload) {
    throw new Error(`${this.name}: mapToStandardLoad() must be implemented by subclass.`);
  }

  async submitQuoteOrBook(loadId, carrierMc, rate) {
    throw new Error(`${this.name}: submitQuoteOrBook() must be implemented by subclass.`);
  }

  getMeta() {
    return {
      key: this.key,
      name: this.name,
      broker_mc: this.brokerMc,
      broker_dot: this.brokerDot,
      auth_type: this.authType,
      configured: this.isConfigured(),
      sandbox: this.key === 'mock'
    };
  }
}

module.exports = { BaseBrokerAdapter };

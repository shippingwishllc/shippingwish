// utils/broker-adapters/adapters.js
// Plug-and-Play External Digital Broker REST API Adapters
// Includes: C.H. Robinson Navisphere, Echo Global Logistics, Coyote/RXO, Uber Freight, Tai Software, and MockBrokerAdapter

const { BaseBrokerAdapter } = require('./base-adapter');

/**
 * 1. C.H. Robinson Navisphere API Adapter (OAuth2)
 */
class CHRobinsonAdapter extends BaseBrokerAdapter {
  constructor() {
    super({
      key: 'ch_robinson',
      name: 'C.H. Robinson Navisphere',
      brokerMc: 'MC-159021',
      brokerDot: '2211386',
      baseUrl: process.env.CHR_API_BASE_URL || 'https://api.navisphere.com/v1',
      authType: 'oauth2'
    });
  }
  isConfigured() {
    return Boolean(process.env.CHR_CLIENT_ID && process.env.CHR_CLIENT_SECRET);
  }
  async authenticate() {
    if (!this.isConfigured()) throw new Error('Set CHR_CLIENT_ID and CHR_CLIENT_SECRET env vars to activate C.H. Robinson Navisphere.');
    if (this.tokenCache.accessToken && Date.now() < this.tokenCache.expiresAt - 60000) {
      return { ok: true, token: this.tokenCache.accessToken, cached: true };
    }
    return this.fetchOAuth2Token({
      tokenUrl: process.env.CHR_TOKEN_URL || 'https://api.navisphere.com/v1/oauth/token',
      clientId: process.env.CHR_CLIENT_ID,
      clientSecret: process.env.CHR_CLIENT_SECRET,
      audience: 'https://api.navisphere.com'
    });
  }
  async fetchAvailableLoads(filters = {}) {
    const { token } = await this.authenticate();
    const qs = new URLSearchParams({ limit: String(filters.limit || 100) });
    const data = await this.httpJson(`${this.baseUrl}/availableLoads?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return Array.isArray(data?.results) ? data.results : (Array.isArray(data?.loads) ? data.loads : []);
  }
  mapToStandardLoad(raw) {
    return {
      external_reference_id: String(raw.loadNumber || raw.id || ''),
      source_channel: 'BROKER_API',
      broker_company_name: 'C.H. Robinson Worldwide Inc',
      broker_mc_number: this.brokerMc,
      broker_dot_number: this.brokerDot,
      broker_contact_email: raw.contactEmail || 'carriers@chrobinson.com',
      broker_contact_phone: raw.contactPhone || '(800) 323-7587',
      broker_verified: true,
      origin_city: raw.origin?.city || '',
      origin_state: raw.origin?.stateCode || '',
      origin_zip: raw.origin?.postalCode || '',
      destination_city: raw.destination?.city || '',
      destination_state: raw.destination?.stateCode || '',
      destination_zip: raw.destination?.postalCode || '',
      pickup_date_start: raw.pickUpByDate || raw.readyDate,
      delivery_date_start: raw.deliverByDate,
      equipment_type: raw.equipment?.description || raw.mode || '53ft Dry Van',
      weight_lbs: raw.weight?.value || raw.weightLbs || 42000,
      length_ft: raw.equipment?.length || 53,
      full_or_partial: raw.isPartial ? 'LTL' : 'FTL',
      commodity_description: raw.commodity || 'General Freight',
      rate_total_usd: raw.availableLoadCosts?.[0]?.sourceCostPerUnit || raw.targetRate || 0,
      estimated_miles: raw.distance?.value || raw.miles || 0,
      notes: raw.specialInstructions || 'C.H. Robinson Navisphere API Load'
    };
  }
  async submitQuoteOrBook(loadId, carrierMc, rate) {
    const { token } = await this.authenticate();
    return this.httpJson(`${this.baseUrl}/availableLoads/${encodeURIComponent(loadId)}/quotes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ carrierMc, quoteAmount: Number(rate), currencyCode: 'USD' })
    });
  }
}

/**
 * 2. Echo Global Logistics Adapter (API Key)
 */
class EchoGlobalAdapter extends BaseBrokerAdapter {
  constructor() {
    super({
      key: 'echo_global',
      name: 'Echo Global Logistics',
      brokerMc: 'MC-514041',
      brokerDot: '2237178',
      baseUrl: process.env.ECHO_API_BASE_URL || 'https://api.echo.com/v1',
      authType: 'api_key'
    });
  }
  isConfigured() {
    return Boolean(process.env.ECHO_API_KEY);
  }
  async authenticate() {
    if (!this.isConfigured()) throw new Error('Set ECHO_API_KEY env var to activate Echo Global Logistics.');
    return { ok: true, token: process.env.ECHO_API_KEY };
  }
  async fetchAvailableLoads() {
    const { token } = await this.authenticate();
    const data = await this.httpJson(`${this.baseUrl}/shipments/available`, {
      headers: { 'Ocp-Apim-Subscription-Key': token, Authorization: `Bearer ${token}` }
    });
    return Array.isArray(data?.shipments) ? data.shipments : (Array.isArray(data) ? data : []);
  }
  mapToStandardLoad(raw) {
    return {
      external_reference_id: String(raw.shipmentId || raw.id || ''),
      source_channel: 'BROKER_API',
      broker_company_name: 'Echo Global Logistics Inc',
      broker_mc_number: this.brokerMc,
      broker_dot_number: this.brokerDot,
      broker_contact_email: raw.repEmail || 'carriers@echo.com',
      broker_contact_phone: raw.repPhone || '(800) 354-7993',
      broker_verified: true,
      origin_city: raw.originCity || raw.origin?.city || '',
      origin_state: raw.originState || raw.origin?.state || '',
      origin_zip: raw.originZip || raw.origin?.zip || '',
      destination_city: raw.destinationCity || raw.destination?.city || '',
      destination_state: raw.destinationState || raw.destination?.state || '',
      destination_zip: raw.destinationZip || raw.destination?.zip || '',
      pickup_date_start: raw.pickupDate,
      delivery_date_start: raw.deliveryDate,
      equipment_type: raw.equipmentType || '53ft Dry Van',
      weight_lbs: raw.weight || 42000,
      length_ft: raw.equipmentLength || 53,
      full_or_partial: raw.mode === 'LTL' ? 'LTL' : 'FTL',
      commodity_description: raw.commodity || 'General Freight',
      rate_total_usd: raw.rate || raw.bookNowRate || 0,
      estimated_miles: raw.miles || 0,
      notes: raw.notes || 'Echo Global Logistics API Load'
    };
  }
  async submitQuoteOrBook(loadId, carrierMc, rate) {
    const { token } = await this.authenticate();
    return this.httpJson(`${this.baseUrl}/shipments/${encodeURIComponent(loadId)}/offers`, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': token, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ carrierMc, offeredRate: Number(rate) })
    });
  }
}

/**
 * 3. Coyote / RXO Connect Adapter (OAuth2)
 */
class CoyoteRxoAdapter extends BaseBrokerAdapter {
  constructor() {
    super({
      key: 'coyote_rxo',
      name: 'Coyote / RXO Connect',
      brokerMc: 'MC-561386',
      brokerDot: '2236410',
      baseUrl: process.env.COYOTE_API_BASE_URL || 'https://api.coyote.com/v1',
      authType: 'oauth2'
    });
  }
  isConfigured() {
    return Boolean(process.env.COYOTE_CLIENT_ID && process.env.COYOTE_CLIENT_SECRET);
  }
  async authenticate() {
    if (!this.isConfigured()) throw new Error('Set COYOTE_CLIENT_ID and COYOTE_CLIENT_SECRET env vars to activate Coyote / RXO.');
    if (this.tokenCache.accessToken && Date.now() < this.tokenCache.expiresAt - 60000) {
      return { ok: true, token: this.tokenCache.accessToken, cached: true };
    }
    return this.fetchOAuth2Token({
      tokenUrl: process.env.COYOTE_TOKEN_URL || 'https://api.coyote.com/connect/token',
      clientId: process.env.COYOTE_CLIENT_ID,
      clientSecret: process.env.COYOTE_CLIENT_SECRET
    });
  }
  async fetchAvailableLoads() {
    const { token } = await this.authenticate();
    const data = await this.httpJson(`${this.baseUrl}/AvailableLoads/Search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pageSize: 100 })
    });
    return Array.isArray(data?.loads) ? data.loads : [];
  }
  mapToStandardLoad(raw) {
    return {
      external_reference_id: String(raw.loadId || raw.id || ''),
      source_channel: 'BROKER_API',
      broker_company_name: 'Coyote / RXO Logistics',
      broker_mc_number: this.brokerMc,
      broker_dot_number: this.brokerDot,
      broker_contact_email: raw.contactEmail || 'carrier@rxo.com',
      broker_contact_phone: raw.contactPhone || '(877) 626-9683',
      broker_verified: true,
      origin_city: raw.origin?.city || '',
      origin_state: raw.origin?.state || '',
      origin_zip: raw.origin?.postalCode || '',
      destination_city: raw.destination?.city || '',
      destination_state: raw.destination?.state || '',
      destination_zip: raw.destination?.postalCode || '',
      pickup_date_start: raw.pickupDate,
      delivery_date_start: raw.deliveryDate,
      equipment_type: raw.equipmentType || '53ft Dry Van',
      weight_lbs: raw.weight || 42000,
      full_or_partial: 'FTL',
      commodity_description: raw.commodity || 'General Freight',
      rate_total_usd: raw.rate?.value || raw.rate || 0,
      estimated_miles: raw.distance?.value || raw.miles || 0,
      notes: raw.notes || 'Coyote / RXO API Load'
    };
  }
  async submitQuoteOrBook(loadId, carrierMc, rate) {
    const { token } = await this.authenticate();
    return this.httpJson(`${this.baseUrl}/AvailableLoads/${encodeURIComponent(loadId)}/Book`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ carrierMc, rate: Number(rate) })
    });
  }
}

/**
 * 4. Uber Freight API Adapter (OAuth2)
 */
class UberFreightAdapter extends BaseBrokerAdapter {
  constructor() {
    super({
      key: 'uber_freight',
      name: 'Uber Freight',
      brokerMc: 'MC-987720',
      brokerDot: '2953708',
      baseUrl: process.env.UBER_FREIGHT_API_BASE_URL || 'https://api.uberfreight.com/v1',
      authType: 'oauth2'
    });
  }
  isConfigured() {
    return Boolean(process.env.UBER_FREIGHT_CLIENT_ID && process.env.UBER_FREIGHT_CLIENT_SECRET);
  }
  async authenticate() {
    if (!this.isConfigured()) throw new Error('Set UBER_FREIGHT_CLIENT_ID and UBER_FREIGHT_CLIENT_SECRET env vars to activate Uber Freight.');
    if (this.tokenCache.accessToken && Date.now() < this.tokenCache.expiresAt - 60000) {
      return { ok: true, token: this.tokenCache.accessToken, cached: true };
    }
    return this.fetchOAuth2Token({
      tokenUrl: process.env.UBER_FREIGHT_TOKEN_URL || 'https://auth.uber.com/oauth/v2/token',
      clientId: process.env.UBER_FREIGHT_CLIENT_ID,
      clientSecret: process.env.UBER_FREIGHT_CLIENT_SECRET
    });
  }
  async fetchAvailableLoads() {
    const { token } = await this.authenticate();
    const data = await this.httpJson(`${this.baseUrl}/loads`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return Array.isArray(data?.loads) ? data.loads : [];
  }
  mapToStandardLoad(raw) {
    return {
      external_reference_id: String(raw.load_id || raw.id || ''),
      source_channel: 'BROKER_API',
      broker_company_name: 'Uber Freight LLC',
      broker_mc_number: this.brokerMc,
      broker_dot_number: this.brokerDot,
      broker_contact_email: raw.contact_email || 'support@uberfreight.com',
      broker_contact_phone: raw.contact_phone || '(844) 822-8237',
      broker_verified: true,
      origin_city: raw.origin?.city || '',
      origin_state: raw.origin?.state || '',
      origin_zip: raw.origin?.zip || '',
      destination_city: raw.destination?.city || '',
      destination_state: raw.destination?.state || '',
      destination_zip: raw.destination?.zip || '',
      pickup_date_start: raw.pickup_window_start,
      delivery_date_start: raw.delivery_window_start,
      equipment_type: raw.equipment_type || '53ft Dry Van',
      weight_lbs: raw.weight_lbs || 42000,
      full_or_partial: 'FTL',
      commodity_description: raw.commodity || 'General Freight',
      rate_total_usd: raw.rate_usd || 0,
      estimated_miles: raw.miles || 0,
      notes: raw.notes || 'Uber Freight API Load'
    };
  }
  async submitQuoteOrBook(loadId, carrierMc, rate) {
    const { token } = await this.authenticate();
    return this.httpJson(`${this.baseUrl}/loads/${encodeURIComponent(loadId)}/book`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ carrier_mc: carrierMc, rate_usd: Number(rate) })
    });
  }
}

/**
 * 5. Tai Software TMS Broker Adapter (API Key)
 */
class TaiSoftwareAdapter extends BaseBrokerAdapter {
  constructor() {
    super({
      key: 'tai_software',
      name: 'Tai Software Broker TMS',
      brokerMc: process.env.TAI_BROKER_MC || null,
      baseUrl: process.env.TAI_API_BASE_URL || 'https://api.tai-software.com/PublicApi/v1',
      authType: 'api_key'
    });
  }
  isConfigured() {
    return Boolean(process.env.TAI_API_KEY);
  }
  async authenticate() {
    if (!this.isConfigured()) throw new Error('Set TAI_API_KEY env var to activate Tai Software TMS.');
    return { ok: true, token: process.env.TAI_API_KEY };
  }
  async fetchAvailableLoads() {
    const { token } = await this.authenticate();
    const data = await this.httpJson(`${this.baseUrl}/AvailableLoads`, {
      headers: { 'x-api-key': token }
    });
    return Array.isArray(data?.loads) ? data.loads : (Array.isArray(data) ? data : []);
  }
  mapToStandardLoad(raw) {
    return {
      external_reference_id: String(raw.shipmentId || raw.loadNumber || ''),
      source_channel: 'BROKER_API',
      broker_company_name: raw.brokerName || process.env.TAI_BROKER_NAME || 'Tai TMS Partner Broker',
      broker_mc_number: raw.brokerMc || this.brokerMc,
      broker_contact_email: raw.contactEmail || null,
      broker_contact_phone: raw.contactPhone || null,
      broker_verified: Boolean(raw.brokerMc || this.brokerMc),
      origin_city: raw.originCity || '',
      origin_state: raw.originState || '',
      origin_zip: raw.originZip || '',
      destination_city: raw.destinationCity || '',
      destination_state: raw.destinationState || '',
      destination_zip: raw.destinationZip || '',
      pickup_date_start: raw.pickupDate,
      delivery_date_start: raw.deliveryDate,
      equipment_type: raw.equipment || '53ft Dry Van',
      weight_lbs: raw.weight || 42000,
      full_or_partial: raw.isLtl ? 'LTL' : 'FTL',
      commodity_description: raw.commodity || 'General Freight',
      rate_total_usd: raw.targetRate || raw.rate || 0,
      estimated_miles: raw.miles || 0,
      notes: raw.notes || 'Tai TMS Partner Load'
    };
  }
  async submitQuoteOrBook(loadId, carrierMc, rate) {
    const { token } = await this.authenticate();
    return this.httpJson(`${this.baseUrl}/AvailableLoads/${encodeURIComponent(loadId)}/Quotes`, {
      method: 'POST',
      headers: { 'x-api-key': token },
      body: JSON.stringify({ carrierMc, amount: Number(rate) })
    });
  }
}

/**
 * 6. MockBrokerAdapter — Sandbox / End-to-End Integration Testing Adapter
 * Never runs in production cron unless explicitly invoked via /api/v1/adapters/test-mock
 */
class MockBrokerAdapter extends BaseBrokerAdapter {
  constructor() {
    super({
      key: 'mock',
      name: 'MockBrokerAdapter (Sandbox E2E)',
      brokerMc: 'MC-159021',
      brokerDot: '2211386',
      baseUrl: 'sandbox://mock-broker',
      authType: 'none'
    });
  }
  isConfigured() {
    return true;
  }
  async authenticate() {
    return { ok: true, token: 'sandbox_oauth2_mock_token', expires_in: 3600 };
  }
  async fetchAvailableLoads() {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    return [
      {
        ref: 'MOCK-CHR-1001',
        originCity: 'Dallas', originState: 'TX', originZip: '75201',
        destCity: 'Atlanta', destState: 'GA', destZip: '30301',
        equipment: 'DRY_VAN', weightLbs: 42000, lengthFt: 53, loadType: 'FTL',
        commodity: 'Consumer Packaged Goods (Sandbox)',
        rateUsd: 2950, miles: 781, pickupDate: today, deliveryDate: tomorrow,
        brokerName: 'Sandbox Freight Partner LLC', brokerMc: 'MC-159021',
        contactEmail: 'sandbox-dispatch@loadsnexus.com', contactPhone: '(800) 580-3101'
      },
      {
        ref: 'MOCK-ECHO-1002',
        originCity: 'Chicago', originState: 'IL', originZip: '60601',
        destCity: 'Nashville', destState: 'TN', destZip: '37201',
        equipment: 'REEFER', weightLbs: 38500, lengthFt: 53, loadType: 'FTL',
        commodity: 'Temperature Controlled Produce 34F (Sandbox)',
        rateUsd: 2150, miles: 472, pickupDate: today, deliveryDate: tomorrow,
        brokerName: 'Sandbox ColdChain Brokerage', brokerMc: 'MC-514041',
        contactEmail: 'sandbox-reefer@loadsnexus.com', contactPhone: '(800) 580-3101'
      }
    ];
  }
  mapToStandardLoad(raw) {
    return {
      external_reference_id: raw.ref,
      source_channel: 'BROKER_API',
      broker_company_name: raw.brokerName,
      broker_mc_number: raw.brokerMc,
      broker_dot_number: this.brokerDot,
      broker_contact_email: raw.contactEmail,
      broker_contact_phone: raw.contactPhone,
      broker_verified: true,
      origin_city: raw.originCity,
      origin_state: raw.originState,
      origin_zip: raw.originZip,
      destination_city: raw.destCity,
      destination_state: raw.destState,
      destination_zip: raw.destZip,
      pickup_date_start: raw.pickupDate,
      delivery_date_start: raw.deliveryDate,
      equipment_type: raw.equipment,
      weight_lbs: raw.weightLbs,
      length_ft: raw.lengthFt,
      full_or_partial: raw.loadType,
      commodity_description: raw.commodity,
      rate_total_usd: raw.rateUsd,
      estimated_miles: raw.miles,
      notes: 'MockBrokerAdapter Sandbox Payload'
    };
  }
  async submitQuoteOrBook(loadId, carrierMc, rate) {
    return {
      ok: true,
      sandbox: true,
      confirmation_id: `MOCK-CONF-${Date.now()}`,
      load_id: loadId,
      carrier_mc: carrierMc,
      accepted_rate_usd: Number(rate),
      status: 'QUOTE_SUBMITTED'
    };
  }
}

module.exports = {
  CHRobinsonAdapter,
  EchoGlobalAdapter,
  CoyoteRxoAdapter,
  UberFreightAdapter,
  TaiSoftwareAdapter,
  MockBrokerAdapter
};

// mobile/shared/api.js
// Unified API Client for all LoadNexus & Shipping Wish Mobile Applications

import { CONFIG } from './config';

class MobileApiClient {
  constructor() {
    this.token = null;
    this.user = null;
    this.customBaseUrl = null;
  }

  setBaseUrl(url) {
    if (url && url.trim()) {
      this.customBaseUrl = url.trim().replace(/\/+$/, '');
    }
  }

  getBaseUrl() {
    return this.customBaseUrl || CONFIG.API_BASE;
  }

  setAuthToken(token) {
    this.token = token;
  }

  getAuthToken() {
    return this.token;
  }

  setUser(user) {
    this.user = user;
  }

  getUser() {
    return this.user;
  }

  async request(endpoint, options = {}) {
    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers = {
      'Accept': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    // Default to JSON content type if body is stringified or object (unless multipart)
    if (options.body && !(options.body instanceof FormData) && typeof options.body === 'object') {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const contentType = response.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { text };
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: (data && (data.error || data.message)) || `Server returned ${response.status}`,
          data
        };
      }

      return {
        ok: true,
        status: response.status,
        data
      };
    } catch (err) {
      console.warn(`[MobileApi] Error calling ${endpoint}:`, err.message);
      return {
        ok: false,
        status: 0,
        error: `Network error: ${err.message}. Please check connection to ${baseUrl}.`
      };
    }
  }

  // --- Auth APIs ---
  async login(email, password) {
    const res = await this.request('/api/login', {
      method: 'POST',
      body: { email, password }
    });

    if (res.ok && res.data && res.data.token) {
      this.setAuthToken(res.data.token);
      this.setUser(res.data.user);
    }
    return res;
  }

  async getMe() {
    const res = await this.request('/api/me', { method: 'GET' });
    if (res.ok && res.data && res.data.user) {
      this.setUser(res.data.user);
    }
    return res;
  }

  logout() {
    this.token = null;
    this.user = null;
  }

  // --- Driver & Load APIs ---
  async getLoads(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    const endpoint = query ? `/api/loads?${query}` : '/api/loads';
    return this.request(endpoint, { method: 'GET' });
  }

  async updateLoadStatus(loadId, status, notes = '') {
    return this.request(`/api/loads/${loadId}/status`, {
      method: 'PATCH',
      body: { status, notes }
    });
  }

  async sendGpsPing(latitude, longitude, speed = 0, heading = 0, loadId = null) {
    return this.request('/api/tracking/ping', {
      method: 'POST',
      body: {
        latitude,
        longitude,
        speed,
        heading,
        load_id: loadId,
        timestamp: new Date().toISOString()
      }
    });
  }

  async uploadDocument(loadId, documentType, fileUri, fileName = 'document.jpg') {
    const formData = new FormData();
    formData.append('load_id', String(loadId));
    formData.append('document_type', documentType); // 'bol', 'pod', 'lumper', 'rate_confirmation'
    formData.append('file', {
      uri: fileUri,
      type: 'image/jpeg',
      name: fileName
    });

    return this.request('/api/documents/upload', {
      method: 'POST',
      body: formData
    });
  }

  // --- LoadNexus Loadboard & Broker APIs ---
  async searchLoads(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    const endpoint = query ? `/api/loadboard/search?${query}` : '/api/loadboard/search';
    return this.request(endpoint, { method: 'GET' });
  }

  async inquireBroker(loadId, rateOffer, message, carrierInfo = {}) {
    return this.request('/api/loadboard/inquire-broker', {
      method: 'POST',
      body: {
        load_id: loadId,
        rate_offer: rateOffer,
        message,
        carrier_info: carrierInfo
      }
    });
  }

  async postTruckCapacity(truckData) {
    return this.request('/api/loadboard/truck-posts', {
      method: 'POST',
      body: truckData
    });
  }

  async getTruckPosts(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    const endpoint = query ? `/api/loadboard/truck-posts?${query}` : '/api/loadboard/truck-posts';
    return this.request(endpoint, { method: 'GET' });
  }

  async deleteTruckPost(id) {
    return this.request(`/api/loadboard/truck-posts/${id}`, {
      method: 'DELETE'
    });
  }

  async postBrokerLoad(loadData) {
    return this.request('/api/loadboard/broker/post-load', {
      method: 'POST',
      body: loadData
    });
  }

  async getBrokerScores() {
    return this.request('/api/loadboard/brokers/scores', { method: 'GET' });
  }

  // --- TMS Invoices & Accounting APIs ---
  async getInvoices() {
    return this.request('/api/invoices', { method: 'GET' });
  }

  // --- Mobile Push Notifications ---
  async registerPushToken(token, platform = 'expo', appName = 'shippingwish') {
    return this.request('/api/mobile/push-token', {
      method: 'POST',
      body: { token, platform, appName }
    });
  }

  async unregisterPushToken(token = null) {
    return this.request('/api/mobile/push-token', {
      method: 'DELETE',
      body: { token }
    });
  }

  // --- In-App Load Messaging & Timeline ---
  async getLoadMessages(loadId) {
    return this.request(`/api/loads/${loadId}/messages`, { method: 'GET' });
  }

  async sendLoadMessage(loadId, message, attachments = []) {
    return this.request(`/api/loads/${loadId}/messages`, {
      method: 'POST',
      body: { message, attachments }
    });
  }

  async getLoadTimeline(loadId) {
    return this.request(`/api/loads/${loadId}/timeline`, { method: 'GET' });
  }

  // --- Live Fleet Telematics ---
  async getLiveFleet() {
    return this.request('/api/tracking/live-fleet', { method: 'GET' });
  }

  // --- Smart Matchmaking Engine ---
  async getTruckMatches(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return this.request(`/api/loadboard/matches/truck?${query}`, { method: 'GET' });
  }

  async getLoadMatches(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return this.request(`/api/loadboard/matches/load?${query}`, { method: 'GET' });
  }

  async getLiveMatchesBoard() {
    return this.request('/api/loadboard/matches/live-board', { method: 'GET' });
  }

  // --- Carrier FMCSA Safety Vetting ---
  async vetCarrier(mcOrDot) {
    return this.request(`/api/carrier-vetting/${encodeURIComponent(mcOrDot)}`, { method: 'GET' });
  }

  // --- Digital Rate Confirmation (RateCon) & E-Signature ---
  async getRateConPreview(loadId) {
    return this.request(`/api/loads/${loadId}/ratecon/preview`, { method: 'GET' });
  }

  getRateConPdfUrl(loadId) {
    return `${this.getBaseUrl()}/api/loads/${loadId}/ratecon/pdf`;
  }

  async signRateCon(loadId, signerName, signatureData = null) {
    return this.request(`/api/loads/${loadId}/ratecon/sign`, {
      method: 'POST',
      body: { signer_name: signerName, signature_data: signatureData }
    });
  }

  // --- Freight Factoring & Instant QuickPay ---
  async submitFactoring(loadId, paymentMethod = 'quickpay_24h', factoringData = {}) {
    return this.request('/api/factoring/submit', {
      method: 'POST',
      body: {
        load_id: loadId,
        payment_method: paymentMethod,
        ...factoringData
      }
    });
  }

  async getFactoringSubmissions() {
    return this.request('/api/factoring/submissions', { method: 'GET' });
  }

  async approveFactoringPayout(submissionId) {
    return this.request(`/api/factoring/approve/${submissionId}`, { method: 'POST' });
  }

  getFactoringPacketPdfUrl(submissionId) {
    return `${this.getBaseUrl()}/api/factoring/packet/${submissionId}/pdf`;
  }

  // --- Spot Rate Benchmark & Lane Pricing ---
  async getRateBenchmark(origin, destination, equipment = 'reefer', dieselPrice = 3.65) {
    const query = new URLSearchParams({ origin, destination, equipment, diesel_price: dieselPrice }).toString();
    return this.request(`/api/rates/benchmark?${query}`, { method: 'GET' });
  }

  async getTopLanesBenchmark() {
    return this.request('/api/rates/top-lanes', { method: 'GET' });
  }

  // --- Instant Book-It-Now & Counter-Offer Bidding ---
  async submitLoadBid(bidData) {
    return this.request('/api/bids/submit', {
      method: 'POST',
      body: bidData
    });
  }

  async getLoadBids(loadId) {
    return this.request(`/api/bids/load/${loadId}`, { method: 'GET' });
  }

  async getMyBids() {
    return this.request('/api/bids/my-bids', { method: 'GET' });
  }

  async respondToBid(bidId, action, counterAmount = null, counterNotes = null) {
    return this.request(`/api/bids/${bidId}/respond`, {
      method: 'POST',
      body: { action, counter_amount: counterAmount, counter_notes: counterNotes }
    });
  }

  async getBiddingStats() {
    return this.request('/api/bids/stats/summary', { method: 'GET' });
  }

  // --- Automated Detention Clock & Accessorial Invoicing ---
  async checkinDetention(loadId, stopType = 'shipper', coords = { lat: 32.7767, lon: -96.7970 }) {
    return this.request('/api/detention/checkin', {
      method: 'POST',
      body: { load_id: loadId, stop_type: stopType, gps_lat: coords.lat, gps_lon: coords.lon }
    });
  }

  async checkoutDetention(loadId, stopType = 'shipper', accessorials = {}) {
    return this.request('/api/detention/checkout', {
      method: 'POST',
      body: { load_id: loadId, stop_type: stopType, ...accessorials }
    });
  }

  async getDetentionDetails(loadId) {
    return this.request(`/api/detention/load/${loadId}`, { method: 'GET' });
  }

  async getActiveDwellings() {
    return this.request('/api/detention/active', { method: 'GET' });
  }

  getDetentionInvoicePdfUrl(loadId) {
    return `${this.getBaseUrl()}/api/detention/invoice/${loadId}/pdf`;
  }

  // --- Instant On-Demand ACORD 25 COI Desk ---
  async getCoiPreview() {
    return this.request('/api/coi/preview', { method: 'GET' });
  }

  async generateBrokerCoi(holderData = {}) {
    return this.request('/api/coi/generate', {
      method: 'POST',
      body: holderData
    });
  }

  // --- ELD Electronic Logbook & FMCSA HOS Compliance ---
  async switchDutyStatus(dutyStatus, meta = {}) {
    return this.request('/api/eld/status-change', {
      method: 'POST',
      body: { duty_status: dutyStatus, ...meta }
    });
  }

  async getDriverHosClocks(driverId) {
    return this.request(`/api/eld/clocks/${driverId}`, { method: 'GET' });
  }

  async getFleetEldStatus() {
    return this.request('/api/eld/fleet-status', { method: 'GET' });
  }

  getDailyLogPdfUrl(driverId) {
    return `${this.getBaseUrl()}/api/eld/logs/daily/${driverId}/pdf`;
  }

  // --- Automated IFTA Fuel Tax Engine ---
  async logIftaTripMiles(tripData) {
    return this.request('/api/ifta-tax/trips/log', {
      method: 'POST',
      body: tripData
    });
  }

  async recordIftaFuelPurchase(fuelData) {
    return this.request('/api/ifta-tax/fuel/record', {
      method: 'POST',
      body: fuelData
    });
  }

  async getIftaQuarterlySummary(quarter = '2026-Q1', carrierId = null) {
    let url = `/api/ifta-tax/quarterly-summary?quarter=${encodeURIComponent(quarter)}`;
    if (carrierId) url += `&carrier_id=${carrierId}`;
    return this.request(url, { method: 'GET' });
  }

  getIftaQuarterlyPdfUrl(quarter = '2026-Q1', carrierId = null) {
    let url = `${this.getBaseUrl()}/api/ifta-tax/report/${encodeURIComponent(quarter)}/pdf`;
    if (carrierId) url += `?carrier_id=${carrierId}`;
    return url;
  }

  // --- Phase 14: Electronic DVIR Vehicle Inspections ---
  async submitDvir(dvirData) {
    return this.request('/api/dvir/submit', {
      method: 'POST',
      body: dvirData
    });
  }

  async getDvirHistory(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    return this.request(`/api/dvir/history?${query}`, { method: 'GET' });
  }

  async getDvirDetails(id) {
    return this.request(`/api/dvir/${id}`, { method: 'GET' });
  }

  async signoffMechanicDvir(dvirId, mechanicData) {
    return this.request(`/api/dvir/${dvirId}/mechanic-signoff`, {
      method: 'POST',
      body: mechanicData
    });
  }

  getDvirPdfUrl(dvirId) {
    return `${this.getBaseUrl()}/api/dvir/${dvirId}/pdf`;
  }

  // --- Phase 15: FMCSA Part 391 Driver Qualification (DQ) Vault ---
  async getDqFleetCompliance(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    const endpoint = query ? `/api/dq/fleet?${query}` : '/api/dq/fleet';
    return this.request(endpoint, { method: 'GET' });
  }

  async getDriverDqDetails(id) {
    return this.request(`/api/dq/${id}`, { method: 'GET' });
  }

  async upsertDriverDqFile(dqData) {
    return this.request('/api/dq/upsert', {
      method: 'POST',
      body: dqData
    });
  }

  async renewDriverDqCredentials(id, renewalData) {
    return this.request(`/api/dq/${id}/renew-credentials`, {
      method: 'POST',
      body: renewalData
    });
  }

  async checkDriverDispatchEligibility(driverId) {
    return this.request(`/api/dq/check-dispatch/${driverId}`, { method: 'GET' });
  }

  getDriverDqPdfUrl(id) {
    return `${this.getBaseUrl()}/api/dq/${id}/pdf`;
  }

  // --- Phase 16: Cargo Claims & OS&D Incident Resolution ---
  async getClaimsRoster(filters = {}) {
    const query = new URLSearchParams(filters).toString();
    const endpoint = query ? `/api/claims/roster?${query}` : '/api/claims/roster';
    return this.request(endpoint, { method: 'GET' });
  }

  async getClaimDetails(id) {
    return this.request(`/api/claims/${id}`, { method: 'GET' });
  }

  async fileCargoClaim(claimData) {
    return this.request('/api/claims/file', {
      method: 'POST',
      body: claimData
    });
  }

  async settleCargoClaim(id, settlementData) {
    return this.request(`/api/claims/${id}/settle`, {
      method: 'POST',
      body: settlementData
    });
  }

  getClaimPdfUrl(id) {
    return `${this.getBaseUrl()}/api/claims/${id}/pdf`;
  }

  // --- Phase 17: Multi-Stop Consolidated LTL & Pallet Cube Optimization ---
  async calculatePalletCube(cubeData) {
    return this.request('/api/multistop/calculate-cube', {
      method: 'POST',
      body: cubeData
    });
  }

  async getMultiStopManifests() {
    return this.request('/api/multistop/roster', { method: 'GET' });
  }

  async getMultiStopManifestDetails(id) {
    return this.request(`/api/multistop/${id}`, { method: 'GET' });
  }

  async createMultiStopManifest(manifestData) {
    return this.request('/api/multistop/create', {
      method: 'POST',
      body: manifestData
    });
  }

  async updateMultiStopStatus(id, status) {
    return this.request(`/api/multistop/${id}/status`, {
      method: 'PATCH',
      body: { status }
    });
  }

  getMultiStopManifestPdfUrl(id) {
    return `${this.getBaseUrl()}/api/multistop/${id}/pdf`;
  }

  // --- Phase 18: Dynamic Multi-Order LTL Pooling & Corridor Consolidation ---
  async analyzeLtlPool(poolData) {
    return this.request('/api/ltl-pools/analyze', {
      method: 'POST',
      body: poolData
    });
  }

  async getLtlPools() {
    return this.request('/api/ltl-pools/roster', { method: 'GET' });
  }

  async createLtlPool(poolData) {
    return this.request('/api/ltl-pools/create', {
      method: 'POST',
      body: poolData
    });
  }

  async convertLtlPoolToManifest(id) {
    return this.request(`/api/ltl-pools/${id}/convert-manifest`, {
      method: 'POST'
    });
  }

  // --- Phase 19: Automated Freight Invoice Audit & 3-Way Match ---
  async getFreightAudits() {
    return this.request('/api/freight-audit/roster', { method: 'GET' });
  }

  async getFreightAuditDetails(id) {
    return this.request(`/api/freight-audit/${id}`, { method: 'GET' });
  }

  async submitFreightAudit(auditData) {
    return this.request('/api/freight-audit/submit', {
      method: 'POST',
      body: auditData
    });
  }

  async approveFreightAudit(id) {
    return this.request(`/api/freight-audit/${id}/approve`, {
      method: 'POST'
    });
  }

  async executeShortPay(id, shortPayData) {
    return this.request(`/api/freight-audit/${id}/short-pay`, {
      method: 'POST',
      body: shortPayData
    });
  }

  getShortPayPdfUrl(id) {
    return `${this.getBaseUrl()}/api/freight-audit/${id}/short-pay-pdf`;
  }

  // --- Phase 20: Shipper Enterprise Contract Rates & Dedicated RFP Tender Bidding ---
  async getShipperContractsRoster() {
    return this.request('/api/shipper-contracts/roster', { method: 'GET' });
  }

  async createShipperContract(contractData) {
    return this.request('/api/shipper-contracts/contracts/create', {
      method: 'POST',
      body: contractData
    });
  }

  async createContractLane(laneData) {
    return this.request('/api/shipper-contracts/lanes/create', {
      method: 'POST',
      body: laneData
    });
  }

  async simulateLaneTender(laneId, tenderData) {
    return this.request(`/api/shipper-contracts/lanes/${laneId}/tender-simulate`, {
      method: 'POST',
      body: tenderData
    });
  }

  async createShipperRfp(rfpData) {
    return this.request('/api/shipper-contracts/rfps/create', {
      method: 'POST',
      body: rfpData
    });
  }

  async submitRfpBid(rfpId, bidData) {
    return this.request(`/api/shipper-contracts/rfps/${rfpId}/bid`, {
      method: 'POST',
      body: bidData
    });
  }

  async awardRfpBid(bidId, awardData) {
    return this.request(`/api/shipper-contracts/bids/${bidId}/award`, {
      method: 'POST',
      body: awardData
    });
  }

  getContractAwardPdfUrl(contractId) {
    return `${this.getBaseUrl()}/api/shipper-contracts/contracts/${contractId}/award-pdf`;
  }

  // --- Phase 21: Autonomous AI Dispatch Voice Agent & Check-Call Bot ---
  async getVoiceCheckCalls() {
    return this.request('/api/dispatch-voice/roster', { method: 'GET' });
  }

  async triggerAiCheckCall(callData) {
    return this.request('/api/dispatch-voice/trigger', {
      method: 'POST',
      body: callData
    });
  }

  async getVoiceCallDetails(callId) {
    return this.request(`/api/dispatch-voice/calls/${callId}`, { method: 'GET' });
  }

  async overrideVoiceCheckCall(callId, overrideData) {
    return this.request(`/api/dispatch-voice/calls/${callId}/manual-override`, {
      method: 'POST',
      body: overrideData
    });
  }

  // --- Phase 22: Automated Detention Fee Collector & Shipper Invoicing ---
  async getDetentionCollectorRoster() {
    return this.request('/api/detention-collector/roster', { method: 'GET' });
  }

  async calculateDetentionDwell(dwellData) {
    return this.request('/api/detention-collector/calculate-dwell', {
      method: 'POST',
      body: dwellData
    });
  }

  async createDetentionInvoice(invoiceData) {
    return this.request('/api/detention-collector/create-invoice', {
      method: 'POST',
      body: invoiceData
    });
  }

  async getDetentionInvoiceDetails(invoiceId) {
    return this.request(`/api/detention-collector/invoices/${invoiceId}`, { method: 'GET' });
  }

  async updateDetentionInvoiceStatus(invoiceId, statusData) {
    return this.request(`/api/detention-collector/invoices/${invoiceId}/status`, {
      method: 'POST',
      body: statusData
    });
  }

  getDetentionPacketPdfUrl(invoiceId) {
    return `${this.getBaseUrl()}/api/detention-collector/invoices/${invoiceId}/packet-pdf`;
  }

  // --- Phase 23: Automated EDI 204, 214, 990 & 210 Freight Transaction Gateway ---
  async getEdiGatewayRoster() {
    return this.request('/api/edi-gateway/roster', { method: 'GET' });
  }

  async submitInboundEdi204(tenderData) {
    return this.request('/api/edi-gateway/tender/inbound-204', {
      method: 'POST',
      body: tenderData
    });
  }

  async respondEdi990(responseData) {
    return this.request('/api/edi-gateway/tender/respond-990', {
      method: 'POST',
      body: responseData
    });
  }

  async sendEdi214Milestone(milestoneData) {
    return this.request('/api/edi-gateway/milestone/send-214', {
      method: 'POST',
      body: milestoneData
    });
  }

  async sendEdi210Invoice(invoiceData) {
    return this.request('/api/edi-gateway/invoice/send-210', {
      method: 'POST',
      body: invoiceData
    });
  }

  async getEdiTransactionDetails(transactionId) {
    return this.request(`/api/edi-gateway/transactions/${transactionId}`, { method: 'GET' });
  }

  getEdiDownloadUrl(transactionId) {
    return `${this.getBaseUrl()}/api/edi-gateway/transactions/${transactionId}/download`;
  }

  // --- Phase 24: Automated Carrier Onboarding & W-9/COI/FMCSA Auto-Credentialing ---
  async getCarrierCredentialingRoster() {
    return this.request('/api/carrier-credentialing/roster', { method: 'GET' });
  }

  async runCarrierAutoVetting(carrierData) {
    return this.request('/api/carrier-credentialing/auto-vet', {
      method: 'POST',
      body: carrierData
    });
  }

  async validateCarrierW9(w9Data) {
    return this.request('/api/carrier-credentialing/validate-w9', {
      method: 'POST',
      body: w9Data
    });
  }

  async verifyCarrierCoi(coiData) {
    return this.request('/api/carrier-credentialing/verify-coi', {
      method: 'POST',
      body: coiData
    });
  }

  async submitCarrierCredentialDecision(carrierId, decisionData) {
    return this.request(`/api/carrier-credentialing/${carrierId}/decision`, {
      method: 'POST',
      body: decisionData
    });
  }

  async getCarrierCredentialDossier(carrierId) {
    return this.request(`/api/carrier-credentialing/${carrierId}`, { method: 'GET' });
  }

  getCarrierCredentialPacketPdfUrl(carrierId) {
    return `${this.getBaseUrl()}/api/carrier-credentialing/${carrierId}/packet-pdf`;
  }

  // --- Phase 25: Broker BMC-84 Surety Bond Watchdog & 30-Day Claim Generator ---
  async getBondWatchdogRoster() {
    return this.request('/api/bond-watchdog/roster', { method: 'GET' });
  }

  async lookupBrokerBond(mcOrDot) {
    return this.request(`/api/bond-watchdog/lookup/${encodeURIComponent(mcOrDot)}`, { method: 'GET' });
  }

  async checkBrokerBondRisk(mcNumber, loadRate) {
    return this.request('/api/bond-watchdog/check-risk', {
      method: 'POST',
      body: { mc_number: mcNumber, load_rate: loadRate }
    });
  }

  async fileSuretyBondClaim(claimData) {
    return this.request('/api/bond-watchdog/claims/file', {
      method: 'POST',
      body: claimData
    });
  }

  async updateSuretyClaimStatus(claimId, statusData) {
    return this.request(`/api/bond-watchdog/claims/${claimId}/status`, {
      method: 'POST',
      body: statusData
    });
  }

  async getSuretyClaimDetails(claimId) {
    return this.request(`/api/bond-watchdog/claims/${claimId}`, { method: 'GET' });
  }

  getSuretyClaimPacketPdfUrl(claimId) {
    return `${this.getBaseUrl()}/api/bond-watchdog/claims/${claimId}/packet-pdf`;
  }
}

export const api = new MobileApiClient();
export default api;


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
}

export const api = new MobileApiClient();
export default api;


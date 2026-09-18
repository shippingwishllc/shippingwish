// mobile/shared/config.js
// Shared configuration for all 4 mobile apps (Driver App, LoadNexus Carrier, Shipping Wish TMS, LoadNexus Broker)

export const CONFIG = {
  // Live Vercel SaaS Production Server URL (All mobile apps connect directly to Vercel)
  LIVE_VERCEL_URL: 'https://shippingwish.com',

  // Local fallback (only if specifically needed for offline debugging)
  DEV_API_URL: 'http://localhost:3000',

  // Default active API URL: Operates 100% with Vercel Cloud SaaS
  get API_BASE() {
    return this.LIVE_VERCEL_URL;
  },

  APP_NAMES: {
    DRIVER: 'Shipping Wish Driver Console',
    LOADNEXUS_CARRIER: 'LoadNexus Carrier & Loadboard',
    TMS: 'Shipping Wish TMS Mobile',
    LOADNEXUS_BROKER: 'LoadNexus Broker Exchange'
  },

  STORAGE_KEYS: {
    AUTH_TOKEN: 'sw_auth_bearer_token',
    USER_PROFILE: 'sw_user_profile',
    SAVED_CREDS: 'sw_saved_credentials',
    ACTIVE_LOAD_ID: 'sw_active_assigned_load_id',
    OFFLINE_QUEUE: 'sw_offline_action_queue'
  }
};

export default CONFIG;

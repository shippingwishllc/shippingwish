// mobile/shared/config.js
// Shared configuration for all 4 mobile apps (Driver App, LoadNexus Carrier, Shipping Wish TMS, LoadNexus Broker)

export const CONFIG = {
  // Production server URL
  PROD_API_URL: 'https://shippingwish.com',

  // Local development fallback (replace with your local IP when testing via Expo Go on physical phone, e.g. 'http://192.168.1.50:3000')
  DEV_API_URL: 'http://localhost:3000',

  // Default active API URL
  get API_BASE() {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      return this.DEV_API_URL;
    }
    return this.PROD_API_URL;
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

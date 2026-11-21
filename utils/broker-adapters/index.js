// utils/broker-adapters/index.js
// Registry & Orchestrator for External Digital Broker REST API Adapters

const {
  CHRobinsonAdapter,
  EchoGlobalAdapter,
  CoyoteRxoAdapter,
  UberFreightAdapter,
  TaiSoftwareAdapter,
  MockBrokerAdapter
} = require('./adapters');
const { upsertStandardLoad, normalizeStandardLoad } = require('../load-ingest');

const ADAPTER_INSTANCES = {
  ch_robinson: new CHRobinsonAdapter(),
  echo_global: new EchoGlobalAdapter(),
  coyote_rxo: new CoyoteRxoAdapter(),
  uber_freight: new UberFreightAdapter(),
  tai_software: new TaiSoftwareAdapter(),
  mock: new MockBrokerAdapter()
};

function listAdapters() {
  return Object.values(ADAPTER_INSTANCES).map((a) => a.getMeta());
}

function getAdapter(key) {
  return ADAPTER_INSTANCES[String(key || '').toLowerCase()] || null;
}

async function runAdapterSync(key, { dryRun = false } = {}) {
  const adapter = getAdapter(key);
  if (!adapter) {
    throw new Error(`Unknown broker adapter "${key}". Available: ${Object.keys(ADAPTER_INSTANCES).join(', ')}`);
  }

  const authRes = await adapter.authenticate();
  const rawPayloads = await adapter.fetchAvailableLoads();
  const mapped = rawPayloads.map((raw) => adapter.mapToStandardLoad(raw));

  if (dryRun) {
    return {
      ok: true,
      adapter: adapter.getMeta(),
      auth_ok: Boolean(authRes?.ok),
      dry_run: true,
      fetched_count: rawPayloads.length,
      normalized_preview: mapped.map((m) => normalizeStandardLoad(m, { source_channel: 'BROKER_API' }))
    };
  }

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const loads = [];

  for (const item of mapped) {
    const r = await upsertStandardLoad(item, { source_channel: 'BROKER_API' });
    if (r.ok) {
      if (r.action === 'inserted') { inserted++; loads.push(r.load); }
      else if (r.action === 'updated') { updated++; loads.push(r.load); }
      else skipped++;
    } else {
      skipped++;
    }
  }

  return {
    ok: true,
    adapter: adapter.getMeta(),
    fetched_count: rawPayloads.length,
    inserted_count: inserted,
    updated_count: updated,
    skipped_count: skipped,
    loads
  };
}

/**
 * Poll ONLY configured real production adapters (never auto-runs MockBrokerAdapter in production!)
 */
async function pollConfiguredAdapters() {
  const results = [];
  for (const [key, adapter] of Object.entries(ADAPTER_INSTANCES)) {
    if (key === 'mock' || !adapter.isConfigured()) continue;
    try {
      const r = await runAdapterSync(key, { dryRun: false });
      results.push({ key, ok: true, inserted: r.inserted_count, updated: r.updated_count });
    } catch (err) {
      results.push({ key, ok: false, error: err.message });
    }
  }
  return results;
}

module.exports = {
  listAdapters,
  getAdapter,
  runAdapterSync,
  pollConfiguredAdapters
};

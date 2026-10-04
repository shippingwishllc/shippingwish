/**
 * content.js — Injected Script on DAT One & Load Boards
 */

// Toast notification display helper
function showToast(message, type = 'success') {
  let container = document.getElementById('sw-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'sw-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `sw-toast ${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <span style="cursor:pointer; opacity:0.7;" onclick="this.parentElement.remove()">&times;</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 4500);
}

// Listen for messages from background script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'SHOW_TOAST') {
    showToast(request.message, request.type);
    sendResponse({ ok: true });
    return false;
  }

  if (request.action === 'TRIGGER_BULK_SYNC') {
    syncAllVisibleLoads(false);
    sendResponse({ ok: true });
    return false;
  }

  if (request.action === 'GET_ACTIVE_LOAD') {
    // Attempt to extract selected text first, then active row/card text
    const selectedText = window.getSelection().toString().trim();
    if (selectedText) {
      sendResponse({ ok: true, text: selectedText, source: 'selection' });
      return false;
    }

    // Try finding open detail drawer or highlighted table row in DAT One
    const detailPanel = document.querySelector('[data-testid="load-details"], .load-details-container, .side-panel, [class*="detail"]');
    if (detailPanel) {
      sendResponse({ ok: true, text: detailPanel.innerText, source: 'detail_panel' });
      return false;
    }

    const activeRow = document.querySelector('[aria-selected="true"], tr.selected, .mat-row.selected');
    if (activeRow) {
      sendResponse({ ok: true, text: activeRow.innerText, source: 'active_row' });
      return false;
    }

    // Fallback: entire page selection or empty
    sendResponse({ ok: false, message: 'Select load text or click a load row in DAT One first.' });
    return false;
  }
});

// Periodic observer to inject "⚡ Send to Shipping Wish" button onto load detail panels
function injectDispatchButtons() {
  // 1. Maintain Floating LoadsNexus Sync Hub
  createOrUpdateFloatingHub();

  // 2. Target load details action header or load cards
  const headers = document.querySelectorAll('[data-testid="load-details-header"], [class*="detail-actions"], .detail-header-actions');
  headers.forEach((header) => {
    if (header.querySelector('.sw-dat-action-btn')) return;

    const btn = document.createElement('button');
    btn.className = 'sw-dat-action-btn';
    btn.innerHTML = '⚡ Send to Shipping Wish';
    btn.title = 'Instantly parse this load, match fleet trucks & send SMS offer';

    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      btn.disabled = true;
      btn.innerText = '⏳ Dispatching...';

      const panel = header.closest('[data-testid="load-details"], [class*="detail"], .drawer') || document.body;
      const textToParse = panel.innerText;

      const { apiUrl = 'https://shippingwish.com' } = await chrome.storage.local.get('apiUrl');

      try {
        const res = await fetch(`${apiUrl}/api/dispatch-desk/parse-dat-loads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToParse })
        });
        const data = await res.json();

        if (data.ok && data.loads?.length) {
          const load = data.loads[0];
          showToast(`✓ Load ${load.load_id} matched! (${load.origin} → ${load.destination}, $${load.rate})`, 'success');
          chrome.runtime.sendMessage({ action: 'FLASH_BADGE', text: '1', color: '#16a34a' });
        } else {
          throw new Error(data.error || 'Could not parse load');
        }
      } catch (err) {
        showToast(`Dispatch failed: ${err.message}`, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '⚡ Send to Shipping Wish';
      }
    });

    header.appendChild(btn);
  });
}

// ==========================================
// 🚀 FLOATING LOADSNEXUS MASTER SYNC HUB & AUTO-SYNC
// ==========================================
let syncedHashes = new Set();
let autoSyncInterval = null;
let totalSyncedToday = 0;

function createOrUpdateFloatingHub() {
  let hub = document.getElementById('sw-floating-sync-hub');
  if (!hub) {
    hub = document.createElement('div');
    hub.id = 'sw-floating-sync-hub';
    hub.innerHTML = `
      <div class="sw-hub-header">
        <div class="sw-hub-title">
          <span class="sw-status-dot"></span>
          <span>LoadsNexus Sync</span>
        </div>
        <span class="sw-badge-count" id="sw-hub-count">0 on screen</span>
      </div>
      <div class="sw-hub-body">
        <div class="sw-stats-row">
          <span>Synced Today:</span>
          <b id="sw-hub-synced-stat">0 loads</b>
        </div>
        <button type="button" id="sw-btn-bulk-sync-page">
          ⚡ 1-Click Sync All Loads
        </button>
        <label class="sw-auto-sync-label">
          <span>🔄 Auto-Sync (Every 8s)</span>
          <input type="checkbox" id="sw-auto-sync-input">
        </label>
      </div>
    `;
    document.body.appendChild(hub);

    const btnSync = hub.querySelector('#sw-btn-bulk-sync-page');
    btnSync.addEventListener('click', () => syncAllVisibleLoads(false));

    const autoCheck = hub.querySelector('#sw-auto-sync-input');
    chrome.storage.local.get(['autoSyncLoads'], (res) => {
      if (res && res.autoSyncLoads) {
        autoCheck.checked = true;
        startAutoSync();
      }
    });

    autoCheck.addEventListener('change', () => {
      chrome.storage.local.set({ autoSyncLoads: autoCheck.checked });
      if (autoCheck.checked) {
        startAutoSync();
        showToast('🟢 LoadsNexus Auto-Sync is now ACTIVE (Scanning every 8s)', 'success');
      } else {
        stopAutoSync();
        showToast('⏸️ Auto-Sync paused', 'info');
      }
    });
  }

  // Update visible loads counter
  const rows = getVisibleLoadRows();
  const countEl = document.getElementById('sw-hub-count');
  if (countEl) {
    countEl.innerText = `${rows.length} on screen`;
  }
}

function getVisibleLoadRows() {
  return Array.from(document.querySelectorAll('mat-row, [role="row"], tr, .load-card, [data-testid*="load-row"]'))
    .filter(el => {
      const text = el.innerText || '';
      return text.includes('$') || text.match(/[A-Z]{2}/);
    });
}

async function syncAllVisibleLoads(isSilent = false) {
  const rows = getVisibleLoadRows();
  if (!rows.length) {
    if (!isSilent) showToast('No load rows found on screen to sync.', 'error');
    return;
  }

  const newRows = [];
  const combinedTexts = [];

  rows.forEach(r => {
    const text = (r.innerText || '').trim();
    if (!text || text.length < 15) return;
    
    const hash = text.slice(0, 100);
    if (!syncedHashes.has(hash)) {
      syncedHashes.add(hash);
      newRows.push(text);
    }
    combinedTexts.push(text);
  });

  if (isSilent && newRows.length === 0) {
    return;
  }

  const textPayload = (isSilent ? newRows : combinedTexts).join('\n---\n');
  const { apiUrl = 'https://shippingwish.com' } = await chrome.storage.local.get('apiUrl');

  try {
    const res = await fetch(`${apiUrl}/api/dispatch-desk/sync-dat-bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText: textPayload })
    });
    const data = await res.json();

    if (data.ok) {
      totalSyncedToday += (data.inserted_count || 0);
      const statEl = document.getElementById('sw-hub-synced-stat');
      if (statEl) statEl.innerText = `${totalSyncedToday} loads`;

      const matchMsg = data.matched_count > 0 ? ` (Matched ${data.matched_count} trucks!)` : '';
      showToast(`✓ Synced ${data.inserted_count || data.total_received} loads to LoadsNexus!${matchMsg}`, 'success');
      chrome.runtime.sendMessage({ action: 'FLASH_BADGE', text: `${data.inserted_count || data.total_received}`, color: '#16a34a' });
    }
  } catch (err) {
    if (!isSilent) showToast(`Sync failed: ${err.message}`, 'error');
  }
}

function startAutoSync() {
  stopAutoSync();
  autoSyncInterval = setInterval(() => {
    syncAllVisibleLoads(true);
    createOrUpdateFloatingHub();
  }, 8000);
}

function stopAutoSync() {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
}

// Run button injector periodically on DOM changes
const observer = new MutationObserver(() => injectDispatchButtons());
observer.observe(document.body, { childList: true, subtree: true });
injectDispatchButtons();


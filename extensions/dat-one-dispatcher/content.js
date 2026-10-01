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
  // Target load details action header or load cards
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

// Run button injector periodically on DOM changes
const observer = new MutationObserver(() => injectDispatchButtons());
observer.observe(document.body, { childList: true, subtree: true });
injectDispatchButtons();

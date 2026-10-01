/**
 * background.js — Service Worker for Shipping Wish DAT Dispatcher
 * Manifest V3 Compliant
 */

// Initialize default settings on installation
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(['apiUrl', 'autoPilot']);
  if (!current.apiUrl) {
    await chrome.storage.local.set({
      apiUrl: 'https://shippingwish.com',
      autoPilot: false
    });
  }

  // Create context menu for quick right-click dispatch
  chrome.contextMenus.create({
    id: 'dispatch-selection-sw',
    title: '⚡ Dispatch to Shipping Wish Fleet',
    contexts: ['selection']
  });
});

// Handle Context Menu clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'dispatch-selection-sw' && info.selectionText) {
    const { apiUrl = 'https://shippingwish.com' } = await chrome.storage.local.get('apiUrl');
    try {
      const response = await fetch(`${apiUrl}/api/dispatch-desk/parse-dat-loads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: info.selectionText })
      });
      const data = await response.json();

      if (data.ok && data.loads?.length) {
        // Flash badge OK
        await chrome.action.setBadgeText({ text: `${data.loads.length}`, tabId: tab.id });
        await chrome.action.setBadgeBackgroundColor({ color: '#16a34a', tabId: tab.id });

        // Forward to content script to display non-intrusive toast
        chrome.tabs.sendMessage(tab.id, {
          action: 'SHOW_TOAST',
          type: 'success',
          message: `✓ Shipping Wish matched ${data.loads.length} load(s)!`
        });
      } else {
        throw new Error(data.error || 'No load recognized');
      }
    } catch (err) {
      await chrome.action.setBadgeText({ text: 'ERR', tabId: tab.id });
      await chrome.action.setBadgeBackgroundColor({ color: '#dc2626', tabId: tab.id });
      chrome.tabs.sendMessage(tab.id, {
        action: 'SHOW_TOAST',
        type: 'error',
        message: `Shipping Wish dispatch error: ${err.message}`
      });
    }

    // Clear badge after 4 seconds
    setTimeout(async () => {
      try { await chrome.action.setBadgeText({ text: '', tabId: tab.id }); } catch {}
    }, 4000);
  }
});

// Listener for runtime messages from content script or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'FLASH_BADGE') {
    (async () => {
      const tabId = sender.tab?.id;
      if (tabId) {
        await chrome.action.setBadgeText({ text: request.text || '✓', tabId });
        await chrome.action.setBadgeBackgroundColor({ color: request.color || '#16a34a', tabId });
        setTimeout(async () => {
          try { await chrome.action.setBadgeText({ text: '', tabId }); } catch {}
        }, 3000);
      }
      sendResponse({ ok: true });
    })();
    return true; // Keep channel open for async response
  }
});

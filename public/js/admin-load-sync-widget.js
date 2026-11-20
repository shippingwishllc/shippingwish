// public/js/admin-load-sync-widget.js
// Super Admin & Admin ONLY Master Load Feed Sync Control
// Mounted exclusively on LoadNexus Command Center (/admin-loadnexus) & Settings (/settings)
// Zero third-party brand mentions — clean "Sync Loads" & Auto-Sync control feeding internal staff + LoadsNexus subscribers!

(function () {
  if (window.__lnxAdminSyncLoaded) return;
  window.__lnxAdminSyncLoaded = true;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function apiJson(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function injectStyles() {
    if (document.getElementById('lnx-admin-sync-css')) return;
    const st = document.createElement('style');
    st.id = 'lnx-admin-sync-css';
    st.textContent = `
      .lnx-sync-bar {
        background: linear-gradient(135deg, #0b1528 0%, #102a43 100%);
        color: #f8fafc;
        border: 1px solid #2563eb;
        border-radius: 14px;
        padding: 14px 18px;
        margin: 14px 0 18px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        box-shadow: 0 10px 26px rgba(11, 21, 40, 0.16);
      }
      .lnx-sync-left { display: flex; flex-direction: column; gap: 3px; }
      .lnx-sync-title { font-size: 14px; font-weight: 800; display: flex; align-items: center; gap: 8px; }
      .lnx-sync-sub { font-size: 12px; color: #94a3b8; }
      .lnx-sync-badge { font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 999px; background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.4); text-transform: uppercase; }
      .lnx-sync-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      .lnx-sync-btn {
        border: none; border-radius: 9px; padding: 9px 14px; font-size: 12.5px; font-weight: 800;
        cursor: pointer; display: inline-flex; align-items: center; gap: 6px; color: #fff; background: #2563eb;
      }
      .lnx-sync-btn:hover { background: #1d4ed8; }
      .lnx-sync-btn.emerald { background: #059669; }
      .lnx-sync-btn.emerald:hover { background: #047857; }
      .lnx-sync-btn.ghost { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.22); }
      .lnx-sync-btn.ghost:hover { background: rgba(255,255,255,0.18); }
      .lnx-sync-modal-bg {
        position: fixed; inset: 0; background: rgba(11,21,40,0.68); z-index: 99995;
        display: none; align-items: center; justify-content: center; padding: 16px;
      }
      .lnx-sync-modal-bg.open { display: flex; }
      .lnx-sync-modal {
        background: #fff; color: #0f172a; border-radius: 16px; width: 100%; max-width: 640px;
        overflow: hidden; box-shadow: 0 24px 70px rgba(11,21,40,0.35);
      }
      .lnx-sync-modal-head { background: #0b1528; color: #fff; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; }
      .lnx-sync-modal-body { padding: 18px 20px; }
    `;
    document.head.appendChild(st);
  }

  function openBulkSyncModal(onSynced) {
    let bg = document.getElementById('lnx-bulk-sync-bg');
    if (!bg) {
      bg = document.createElement('div');
      bg.id = 'lnx-bulk-sync-bg';
      bg.className = 'lnx-sync-modal-bg';
      bg.innerHTML = `
        <div class="lnx-sync-modal">
          <div class="lnx-sync-modal-head">
            <strong style="font-size:15px;">🔄 Sync Loads — Bulk Freight Feed Ingestion (Admin Only)</strong>
            <button id="lnx-bulk-close" style="background:rgba(255,255,255,0.15);color:#fff;border:none;border-radius:8px;width:30px;height:30px;cursor:pointer;font-weight:800;">✕</button>
          </div>
          <div class="lnx-sync-modal-body">
            <p style="font-size:12.5px;color:#475569;margin:0 0 10px;">
              Paste freight rows below to publish them live across <strong>Internal Dispatch Staff</strong> and all <strong>LoadsNexus Subscribers</strong>.
            </p>
            <textarea id="lnx-bulk-text" rows="7" style="width:100%;border:1.5px solid #cbd5e1;border-radius:10px;padding:10px;font-family:monospace;font-size:12px;" placeholder="Dallas, TX -> Atlanta, GA | 53V | 42,000 lbs | $3,200 | Broker Name (MC-123456) | (800) 555-0199"></textarea>
            <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:12px;">
              <button class="lnx-sync-btn emerald" id="lnx-bulk-submit">🚀 Sync &amp; Broadcast Loads</button>
            </div>
            <div id="lnx-bulk-status" style="margin-top:10px;font-size:12.5px;font-weight:700;"></div>
          </div>
        </div>`;
      bg.addEventListener('click', (e) => { if (e.target === bg) bg.classList.remove('open'); });
      document.body.appendChild(bg);
      document.getElementById('lnx-bulk-close').onclick = () => bg.classList.remove('open');
    }
    document.getElementById('lnx-bulk-status').textContent = '';
    bg.classList.add('open');

    document.getElementById('lnx-bulk-submit').onclick = async () => {
      const txt = (document.getElementById('lnx-bulk-text').value || '').trim();
      const st = document.getElementById('lnx-bulk-status');
      if (!txt) { st.style.color = '#dc2626'; st.textContent = 'Please paste load feed text first.'; return; }
      st.style.color = '#2563eb';
      st.textContent = 'Syncing loads and broadcasting to Staff & LoadsNexus Subscribers...';
      try {
        await apiJson('/api/dispatch-desk/parse-dat-loads', {
          method: 'POST',
          body: JSON.stringify({ rawText: txt, text: txt })
        });
        const r = await apiJson('/api/dispatch-desk/sync-network-loads', {
          method: 'POST',
          body: JSON.stringify({ auto_sync_enabled: true })
        });
        st.style.color = '#059669';
        st.textContent = '✅ ' + (r.message || 'Loads synced live!');
        document.getElementById('lnx-bulk-text').value = '';
        if (typeof onSynced === 'function') onSynced(r);
      } catch (e) {
        st.style.color = '#dc2626';
        st.textContent = e.message;
      }
    };
  }

  async function init() {
    try {
      const me = await apiJson('/api/me');
      const role = String(me?.user?.role || '').toLowerCase();
      if (role !== 'admin' && role !== 'super_admin') return; // Strictly Super Admin / Admin ONLY!
    } catch (_) {
      return;
    }

    injectStyles();
    const status = await apiJson('/api/dispatch-desk/sync-network-status').catch(() => ({
      auto_sync_enabled: true,
      live_public_loads: 0,
      last_sync_at: null
    }));

    if (document.querySelector('.lnx-sync-bar')) return;
    const target = document.querySelector('.app-content, main.app-content, main, .main-content, .container');
    if (!target) return;

    const bar = document.createElement('div');
    bar.className = 'lnx-sync-bar';
    let autoOn = status.auto_sync_enabled !== false;

    function renderBar(liveCount, lastAt) {
      bar.innerHTML = `
        <div class="lnx-sync-left">
          <div class="lnx-sync-title">
            <span>🔄 Master Freight Feed — Sync Loads</span>
            <span class="lnx-sync-badge">${autoOn ? '● Auto-Sync ON' : '○ Auto-Sync Paused'}</span>
          </div>
          <div class="lnx-sync-sub" id="lnx-sync-meta">
            <strong>${Number(liveCount || 0).toLocaleString()}</strong> live loads active for Internal Staff &amp; LoadsNexus Subscribers
            ${lastAt ? ` • Last synced: ${esc(new Date(lastAt).toLocaleString())}` : ''}
          </div>
        </div>
        <div class="lnx-sync-actions">
          <button type="button" class="lnx-sync-btn emerald" id="lnx-btn-sync-now">🔄 Sync Loads</button>
          <button type="button" class="lnx-sync-btn ghost" id="lnx-btn-auto-toggle">${autoOn ? '⏸ Pause Auto-Sync' : '▶ Enable Auto-Sync'}</button>
          <button type="button" class="lnx-sync-btn" id="lnx-btn-bulk-sync">📥 Bulk Feed Sync</button>
        </div>
      `;

      document.getElementById('lnx-btn-sync-now').onclick = async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '⏳ Syncing Loads...';
        try {
          const r = await apiJson('/api/dispatch-desk/sync-network-loads', {
            method: 'POST',
            body: JSON.stringify({ auto_sync_enabled: autoOn })
          });
          renderBar(r.live_public_loads, r.synced_at);
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
          btn.textContent = '🔄 Sync Loads';
        }
      };

      document.getElementById('lnx-btn-auto-toggle').onclick = async () => {
        autoOn = !autoOn;
        try {
          const r = await apiJson('/api/dispatch-desk/sync-network-loads', {
            method: 'POST',
            body: JSON.stringify({ auto_sync_enabled: autoOn })
          });
          renderBar(r.live_public_loads, r.synced_at);
        } catch (err) {
          alert(err.message);
        }
      };

      document.getElementById('lnx-btn-bulk-sync').onclick = () => {
        openBulkSyncModal((r) => renderBar(r.live_public_loads, r.synced_at));
      };
    }

    renderBar(status.live_public_loads, status.last_sync_at);
    if (target.firstChild) target.insertBefore(bar, target.firstChild);
    else target.appendChild(bar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

/* Driver Mobile Console — page logic (re-run on shell partial navigation) */
(function () {
  let activeLoad = null;
  let driverLoads = [];

  function $(id) {
    return document.getElementById(id);
  }

  function setButtonsEnabled(enabled) {
    document.querySelectorAll('#load-card .status-btn, #btn-gps-ping').forEach((btn) => {
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? '' : '0.55';
      btn.style.cursor = enabled ? '' : 'not-allowed';
    });
  }

  function showLoadAlert(message, tone) {
    const el = $('load-card-alert');
    if (!el) return;
    if (!message) {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = 'block';
    el.textContent = message;
    el.style.background = tone === 'error' ? 'rgba(220,38,38,0.08)' : 'rgba(245,158,11,0.1)';
    el.style.color = tone === 'error' ? '#b91c1c' : '#b45309';
    el.style.border = tone === 'error' ? '1px solid rgba(220,38,38,0.25)' : '1px solid rgba(245,158,11,0.35)';
  }

  function showEmptyBanner(show) {
    const banner = $('load-empty-banner');
    if (banner) banner.style.display = show ? 'block' : 'none';
    setButtonsEnabled(Boolean(activeLoad));
  }

  async function checkDriverAuth() {
    try {
      const res = await fetch('/api/me', { credentials: 'include' });
      if (!res.ok) { window.location.href = '/login'; return; }
      const data = await res.json();
      if (!data.user) { window.location.href = '/login'; return; }
      const name = data.user.name || 'Driver';
      if ($('driver-name-head')) $('driver-name-head').textContent = name;
      if ($('driver-truck-head')) $('driver-truck-head').textContent = data.user.company_name || 'Carrier fleet';
    } catch (e) {
      window.location.href = '/login';
    }
  }

  async function loadActiveDriverLoad() {
    showLoadAlert('');
    try {
      const res = await fetch('/api/loads', { credentials: 'include' });
      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        showLoadAlert(data.error || 'Subscription or trial required to view loads.', 'error');
        showEmptyBanner(true);
        if ($('kpi-load-lane')) $('kpi-load-lane').textContent = 'Billing required';
        return;
      }
      if (!res.ok) {
        showLoadAlert('Could not load trips. Refresh or try again.', 'error');
        showEmptyBanner(true);
        return;
      }

      const data = await res.json();
      driverLoads = data.loads || [];
      const sel = $('driver-load-select');
      if (sel) {
        sel.innerHTML = '<option value="">Select assigned load…</option>' + driverLoads.map((l) =>
          `<option value="${l.id}">${l.load_number} · ${l.pickup_location} → ${l.delivery_location}</option>`
        ).join('');
      }

      if (driverLoads.length === 0) {
        activeLoad = null;
        showEmptyBanner(true);
        if ($('kpi-load-number')) $('kpi-load-number').textContent = '—';
        if ($('kpi-load-lane')) $('kpi-load-lane').textContent = 'No active load';
        if ($('kpi-load-rate')) $('kpi-load-rate').textContent = '$0.00';
        if ($('kpi-load-miles')) $('kpi-load-miles').textContent = '0 miles';
        if ($('kpi-load-status')) $('kpi-load-status').textContent = '—';
        return;
      }

      showEmptyBanner(false);
      const active = driverLoads.find((l) =>
        ['booked', 'dispatched', 'at_pickup', 'loaded', 'in_transit', 'at_delivery'].includes(l.status)
      ) || driverLoads[0];
      if (sel) sel.value = String(active.id);
      activeLoad = active;
      renderActiveLoad(activeLoad);
      fetchDriverChatMessages();
    } catch (e) {
      console.error('Load driver load error:', e);
      showLoadAlert('Network error loading trips.', 'error');
      showEmptyBanner(true);
    }
  }

  function pickDriverLoad() {
    const id = parseInt($('driver-load-select').value, 10);
    if (!id) {
      activeLoad = null;
      showEmptyBanner(true);
      setButtonsEnabled(false);
      return;
    }
    const found = driverLoads.find((l) => l.id === id);
    if (!found) return;
    activeLoad = found;
    showEmptyBanner(false);
    renderActiveLoad(activeLoad);
    fetchDriverChatMessages();
  }

  function renderActiveLoad(l) {
    if (!l) return;
    if ($('load-number-badge')) $('load-number-badge').textContent = `LOAD #${l.load_number}`;
    if ($('kpi-load-number')) $('kpi-load-number').textContent = l.load_number;
    if ($('kpi-load-rate')) $('kpi-load-rate').textContent = `$${parseFloat(l.rate || 0).toLocaleString()}`;
    if ($('kpi-load-miles')) $('kpi-load-miles').textContent = `${l.miles || 0} miles`;
    if ($('kpi-load-status')) $('kpi-load-status').textContent = formatStatus(l.status);
    if ($('kpi-load-lane')) $('kpi-load-lane').textContent = `${l.pickup_location} → ${l.delivery_location}`;

    if ($('pickup-city')) $('pickup-city').textContent = `${l.pickup_location} ${l.pickup_state ? `(${l.pickup_state})` : ''}`;
    if ($('delivery-city')) $('delivery-city').textContent = `${l.delivery_location} ${l.delivery_state ? `(${l.delivery_state})` : ''}`;
    if ($('miles-badge')) $('miles-badge').textContent = `🚚 ${l.miles || 0} Mi`;

    if ($('info-broker')) $('info-broker').textContent = `${l.broker_name || 'Direct client'} ${l.broker_mc ? `(MC: ${l.broker_mc})` : ''}`;
    if ($('info-cargo')) $('info-cargo').textContent = `${l.commodity || 'General freight'} / ${l.weight ? l.weight + ' lbs' : 'N/A'}`;
    if ($('info-refs')) $('info-refs').textContent = `Ref: ${l.reference_number || 'N/A'} | BOL: ${l.bol_number || 'N/A'}`;
    if ($('info-pickup-time')) $('info-pickup-time').textContent = `${l.pickup_date || 'TBD'} ${l.pickup_time || ''}`;
    if ($('info-delivery-time')) $('info-delivery-time').textContent = `${l.delivery_date || 'TBD'} ${l.delivery_time || ''}`;

    document.querySelectorAll('.status-btn').forEach((btn) => btn.classList.remove('active'));
    const activeBtn = document.getElementById(`sbtn-${l.status}`);
    if (activeBtn) activeBtn.classList.add('active');
    setButtonsEnabled(true);
  }

  function formatStatus(st) {
    return (st || '').replace(/_/g, ' ').toUpperCase();
  }

  async function setTripStatus(newStatus) {
    if (!activeLoad) return;
    try {
      const res = await fetch(`/api/loads/${activeLoad.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        activeLoad.status = newStatus;
        renderActiveLoad(activeLoad);
        sendGpsPing(newStatus);
      }
    } catch (e) { /* ignore */ }
  }

  function sendGpsPing(overrideStatus = null) {
    const msgDiv = $('gps-status-msg');
    const kpiGps = $('kpi-gps-time');
    if (!activeLoad) {
      if (msgDiv) msgDiv.textContent = 'Select a load first.';
      return;
    }
    if (msgDiv) msgDiv.textContent = 'Acquiring GPS coordinates…';

    if (!navigator.geolocation) {
      if (msgDiv) msgDiv.textContent = 'Geolocation not supported by this browser.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        if (msgDiv) msgDiv.textContent = `Sending ${latitude.toFixed(4)}, ${longitude.toFixed(4)}…`;

        try {
          const res = await fetch('/api/tracking/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              loadId: activeLoad ? activeLoad.id : null,
              latitude,
              longitude,
              status: overrideStatus || (activeLoad ? activeLoad.status : 'in_transit'),
              locationName: `GPS Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`
            })
          });
          if (res.ok) {
            const t = new Date().toLocaleTimeString();
            if (msgDiv) msgDiv.textContent = `✓ GPS ping sent (${t})`;
            if (kpiGps) kpiGps.textContent = t;
          } else if (msgDiv) {
            msgDiv.textContent = 'Could not record GPS ping.';
          }
        } catch (err) {
          if (msgDiv) msgDiv.textContent = 'Network error sending GPS ping.';
        }
      },
      (err) => {
        if (msgDiv) msgDiv.textContent = `GPS error: ${err.message}`;
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handlePodFileUpload(input) {
    if (!input.files || input.files.length === 0 || !activeLoad) return;
    const file = input.files[0];
    const alertDiv = $('pod-upload-alert');
    if (alertDiv) {
      alertDiv.textContent = 'Uploading POD…';
      alertDiv.style.color = 'var(--color-amber-600)';
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('loadId', activeLoad.id);
    formData.append('category', 'pod');

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      const data = await res.json();
      if (!alertDiv) return;
      if (!res.ok) {
        alertDiv.textContent = data.error || 'Upload failed.';
        alertDiv.style.color = 'var(--color-error, #dc2626)';
      } else {
        alertDiv.textContent = '✓ POD uploaded — dispatcher notified.';
        alertDiv.style.color = 'var(--color-success, #059669)';
      }
    } catch (err) {
      if (alertDiv) {
        alertDiv.textContent = 'Network error uploading POD.';
        alertDiv.style.color = 'var(--color-error, #dc2626)';
      }
    }
  }

  async function fetchDriverChatMessages() {
    if (!activeLoad) return;
    const box = $('driver-chat-box');
    if (!box) return;
    try {
      const res = await fetch(`/api/messages/load/${activeLoad.id}`, { credentials: 'include' });
      if (!res.ok) {
        box.innerHTML = '<div style="color:var(--text-muted);margin:auto;font-size:12px;">No messages.</div>';
        return;
      }
      const data = await res.json();
      const msgs = data.messages || [];

      if (msgs.length === 0) {
        box.innerHTML = '<div style="color:var(--text-muted);font-size:12px;margin:auto;text-align:center;">No messages yet.<br>Type below to contact dispatch.</div>';
        return;
      }

      box.innerHTML = msgs.map((m) => `
        <div class="driver-chat-bubble">
          <div style="font-size:11px;font-weight:700;color:var(--color-amber-600);margin-bottom:2px;">
            ${escapeHtml(m.sender_name)} <span style="color:var(--text-muted);font-weight:normal;">(${m.sender_role})</span>
          </div>
          <div style="font-size:12px;color:var(--text-primary);">${escapeHtml(m.message)}</div>
          <div style="font-size:9px;color:var(--text-muted);margin-top:4px;">${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      `).join('');
      box.scrollTop = box.scrollHeight;
    } catch (e) { /* ignore */ }
  }

  async function sendDriverMessage(e) {
    e.preventDefault();
    const input = $('driver-chat-input');
    const message = input ? input.value.trim() : '';
    if (!message || !activeLoad) return;

    try {
      const res = await fetch(`/api/messages/load/${activeLoad.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message })
      });
      if (res.ok) {
        input.value = '';
        fetchDriverChatMessages();
      }
    } catch (e) { /* ignore */ }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function initDriverApp() {
    await checkDriverAuth();
    await loadActiveDriverLoad();
  }

  window.pickDriverLoad = pickDriverLoad;
  window.setTripStatus = setTripStatus;
  window.sendGpsPing = sendGpsPing;
  window.handlePodFileUpload = handlePodFileUpload;
  window.sendDriverMessage = sendDriverMessage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDriverApp);
  } else {
    initDriverApp();
  }
})();

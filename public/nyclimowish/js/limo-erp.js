(function () {
  let vehicles = [];
  let bookings = [];

  async function api(path, opts) {
    const res = await fetch('/api' + path, { credentials: 'include', ...opts });
    if (res.status === 401) { window.location.href = '/login?redirect=/erp'; return null; }
    return res.json();
  }

  async function init() {
    const me = await fetch('/api/me', { credentials: 'include' }).then((r) => r.json()).catch(() => null);
    if (!me?.user) { window.location.href = '/login?redirect=/erp'; return; }
    document.getElementById('user-name').textContent = me.user.name;

    const vData = await api('/vehicles');
    if (vData) {
      vehicles = vData.vehicles;
      document.getElementById('m-vehicle').innerHTML = vehicles.map((v) =>
        `<option value="${v.id}">${v.name}</option>`
      ).join('');
    }

    loadStats();
    loadBookings();
  }

  async function loadStats() {
    const data = await api('/erp/stats');
    if (!data) return;
    const s = data.stats;
    document.getElementById('stat-today').textContent = s.today;
    document.getElementById('stat-active').textContent = s.active;
    document.getElementById('stat-completed').textContent = s.month_completed;
    document.getElementById('stat-revenue').textContent = '$' + parseFloat(s.month_revenue).toFixed(0);
  }

  async function loadBookings() {
    const q = document.getElementById('search-q').value;
    const status = document.getElementById('filter-status').value;
    let path = '/erp/bookings?';
    if (q) path += 'q=' + encodeURIComponent(q) + '&';
    if (status) path += 'status=' + status;
    const data = await api(path);
    if (!data) return;
    bookings = data.bookings;
    renderBookings();
  }

  function statusClass(s) {
    const map = { pending: 'pending', confirmed: 'confirmed', dispatched: 'dispatched', completed: 'completed', cancelled: 'cancelled' };
    return 'limo-status-' + (map[s] || 'pending');
  }

  function renderBookings() {
    const tbody = document.getElementById('bookings-tbody');
    if (!bookings.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:#999;">No bookings found</td></tr>';
      return;
    }
    tbody.innerHTML = bookings.map((b) => {
      const route = b.service_type === 'hourly'
        ? b.pickup_address + ' (Hourly)'
        : (b.pickup_address || '').slice(0, 25) + ' → ' + (b.dropoff_address || '').slice(0, 25);
      return `<tr style="cursor:pointer;" data-id="${b.id}">
        <td><strong>${b.booking_number}</strong></td>
        <td>${b.pickup_date}<br><small>${b.pickup_time}</small></td>
        <td>${b.passenger_first_name} ${b.passenger_last_name}<br><small>${b.passenger_phone || ''}</small></td>
        <td style="max-width:200px;font-size:0.8rem;">${route}</td>
        <td>${b.vehicle_name || '—'}</td>
        <td><strong>$${parseFloat(b.total_price).toFixed(2)}</strong></td>
        <td><span class="limo-status-pill ${statusClass(b.status)}">${b.status}</span></td>
        <td>${b.is_manual ? '📞 Phone' : '🌐 Web'}</td>
        <td><button class="limo-btn limo-btn-dark" style="padding:4px 10px;font-size:0.7rem;" onclick="event.stopPropagation();updateStatus(${b.id})">Update</button></td>
      </tr>`;
    }).join('');

    tbody.querySelectorAll('tr[data-id]').forEach((row) => {
      row.addEventListener('click', () => showDetail(row.dataset.id));
    });
  }

  async function showDetail(id) {
    const data = await api('/erp/bookings/' + id);
    if (!data) return;
    const b = data.booking;
    document.getElementById('detail-content').innerHTML = `
      <div style="margin-top:16px;font-size:0.85rem;line-height:1.8;">
        <p><strong>${b.booking_number}</strong></p>
        <p>📍 ${b.pickup_address}</p>
        ${b.dropoff_address ? `<p>📍 ${b.dropoff_address}</p>` : ''}
        <p>📅 ${b.pickup_date} at ${b.pickup_time}</p>
        <p>👤 ${b.passenger_first_name} ${b.passenger_last_name}</p>
        <p>📧 ${b.passenger_email || '—'}</p>
        <p>📞 ${b.passenger_phone || '—'}</p>
        <p>🚗 ${b.vehicle_name || b.vehicle_id}</p>
        <p>💰 $${parseFloat(b.total_price).toFixed(2)} (${b.payment_status})</p>
        ${b.trip_notes ? `<p>📝 ${b.trip_notes}</p>` : ''}
        ${b.internal_notes ? `<p>🔒 ${b.internal_notes}</p>` : ''}
        <div style="margin-top:12px;">
          <select id="detail-status" style="padding:6px;border-radius:6px;border:1px solid #ddd;">
            ${['pending','confirmed','dispatched','en_route','at_pickup','in_progress','completed','cancelled'].map((s) =>
              `<option value="${s}" ${s === b.status ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
          <button class="limo-btn limo-btn-gold" style="padding:6px 14px;font-size:0.75rem;margin-left:8px;" onclick="saveStatus(${b.id})">Save Status</button>
        </div>
        <div style="margin-top:16px;border-top:1px solid #eee;padding-top:12px;">
          <strong>History</strong>
          ${(data.history || []).map((h) => `<p style="color:#666;font-size:0.8rem;">${h.status} — ${new Date(h.created_at).toLocaleString()}</p>`).join('')}
        </div>
      </div>`;
  }

  window.saveStatus = async (id) => {
    const status = document.getElementById('detail-status').value;
    await api('/erp/bookings/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    loadBookings();
    loadStats();
    showDetail(id);
  };

  window.updateStatus = (id) => showDetail(id);

  document.getElementById('btn-new-booking').addEventListener('click', () => {
    document.getElementById('manual-form').style.display = 'block';
    document.getElementById('detail-panel').style.display = 'none';
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    document.getElementById('m-date').value = tomorrow.toISOString().split('T')[0];
    document.getElementById('m-time').value = '12:00';
  });

  document.getElementById('btn-cancel-manual').addEventListener('click', () => {
    document.getElementById('manual-form').style.display = 'none';
    document.getElementById('detail-panel').style.display = 'block';
  });

  document.getElementById('btn-save-manual').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-manual');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    const body = {
      firstName: document.getElementById('m-first').value,
      lastName: document.getElementById('m-last').value,
      phone: document.getElementById('m-phone').value,
      email: document.getElementById('m-email').value,
      pickup: document.getElementById('m-pickup').value,
      dropoff: document.getElementById('m-dropoff').value,
      pickupDate: document.getElementById('m-date').value,
      pickupTime: document.getElementById('m-time').value,
      vehicleId: document.getElementById('m-vehicle').value,
      totalPrice: document.getElementById('m-price').value || undefined,
      internalNotes: document.getElementById('m-notes').value,
      status: 'confirmed'
    };
    const data = await api('/erp/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    btn.disabled = false;
    btn.textContent = 'Save Booking';
    if (data?.booking) {
      document.getElementById('manual-form').style.display = 'none';
      document.getElementById('detail-panel').style.display = 'block';
      loadBookings();
      loadStats();
      showDetail(data.booking.id);
      alert('Booking ' + data.booking.booking_number + ' created!');
    }
  });

  document.getElementById('search-q').addEventListener('input', debounce(loadBookings, 400));
  document.getElementById('filter-status').addEventListener('change', loadBookings);

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  init();
})();

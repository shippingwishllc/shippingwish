(function () {
  let vehicles = [];
  let bookings = [];
  let currentRole = '';
  const esc = (value) => String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('\"','&quot;').replaceAll(\"'\",'&#39;');

  async function api(path, opts) {
    const res = await fetch('/api/nyclimo' + path, { credentials: 'include', ...opts });
    if (res.status === 401) { window.location.href = '/login?redirect=/erp'; return null; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function init() {
    const me = await fetch('/api/nyclimo/me', { credentials: 'include' }).then((r) => r.json()).catch(() => null);
    if (!me?.user) { window.location.href = '/login?redirect=/erp'; return; }
    currentRole = me.user.role;
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
    loadCommissions();
  }

  async function loadCommissions() {
    const target = document.getElementById('commission-ledger');
    try {
      const data = await api('/erp/commissions');
      if (!data || !target) return;
      target.innerHTML = data.commissions.length ? data.commissions.map((c) => `
        <div style="border-top:1px solid #eee;padding:12px 0;">
          <strong>${esc(c.booking_number)}</strong> · ${esc(c.operator_name)}
          <div>Operator payout: ${Number(c.operator_payout_amount).toFixed(2)} (${esc(c.operator_payout_status)})</div>
          ${c.referral_base_id ? `<div>Referral: ${esc(c.referral_name || 'Partner')} · ${Number(c.referral_commission_amount).toFixed(2)} (${esc(c.referral_payout_status)})</div>` : ''}
          <div style="font-size:.8rem;color:#666;">Platform commission: ${Number(c.platform_commission_amount).toFixed(2)} · ${esc(c.status)}</div>
          ${currentRole === 'admin' && c.operator_payout_status === 'earned' ? `<button class="limo-btn limo-btn-dark" style="margin:6px 8px 0 0;padding:6px 10px;" data-payout="operator" data-id="${c.id}">Record operator payout</button>` : ''}
          ${currentRole === 'admin' && c.referral_payout_status === 'earned' ? `<button class="limo-btn limo-btn-outline" style="margin-top:6px;padding:6px 10px;" data-payout="referral" data-id="${c.id}">Record referral payout</button>` : ''}
        </div>`).join('') : '<p style="color:#999;">No completed paid rides have earned commission yet.</p>';
      target.querySelectorAll('button[data-payout]').forEach((button) => button.addEventListener('click', async () => {
        const reference = prompt('Enter the bank transfer or settlement reference. This only records settlement in the ledger.');
        if (!reference) return;
        button.disabled = true;
        try {
          await api('/erp/commissions/' + button.dataset.id + '/payout', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: button.dataset.payout, payout_reference: reference })
          });
          await loadCommissions();
        } catch (err) { alert(err.message); button.disabled = false; }
      }));
    } catch (err) { target.innerHTML = '<p style="color:#b91c1c;">' + esc(err.message) + '</p>'; }
  }

  window.dispatchBooking = async (id) => {
    try {
      const data = await api('/erp/bookings/' + id + '/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      alert(data?.ok ? 'New offers sent to verified matching operator bases.' : (data?.error || 'No partner accepted this dispatch attempt.'));
      await loadBookings();
      await showDetail(id);
    } catch (err) { alert(err.message); }
  };

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
    const map = { pending: 'pending', pending_operator: 'pending', offering: 'dispatched', operator_accepted: 'confirmed', confirmed: 'confirmed', dispatched: 'dispatched', en_route: 'dispatched', completed: 'completed', cancelled: 'cancelled' };
    return 'limo-status-' + (map[s] || 'pending');
  }

  function renderBookings() {
    const tbody = document.getElementById('bookings-tbody');
    if (!bookings.length) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:32px;color:#999;">No bookings found</td></tr>';
      return;
    }
    tbody.innerHTML = bookings.map((b) => {
      const isAirport = b.flight_number || /jfk|lga|ewr|teb|airport/i.test(b.pickup_address + ' ' + b.dropoff_address);
      const badges = [];
      if (isAirport) badges.push('<span style="background:#e0f2fe;color:#0369a1;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;">✈ Airport</span>');
      if (b.meet_and_greet) badges.push('<span style="background:#fef3c7;color:#92400e;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;">VIP M&amp;G</span>');
      if (Number(b.child_seats) > 0) badges.push(`<span style="background:#f3e8ff;color:#6b21a8;padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:600;">👶 ${b.child_seats} Seat(s)</span>`);

      const route = b.service_type === 'hourly'
        ? b.pickup_address + ' (Hourly)'
        : esc(b.pickup_address || '').slice(0, 25) + ' → ' + esc(b.dropoff_address || '').slice(0, 25);
      return `<tr style="cursor:pointer;" data-id="${b.id}">
        <td><strong>${esc(b.booking_number)}</strong>${badges.length ? `<div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap;">${badges.join('')}</div>` : ''}</td>
        <td>${esc(b.pickup_date)}<br><small>${esc(b.pickup_time)}</small></td>
        <td>${esc(b.passenger_first_name)} ${esc(b.passenger_last_name)}<br><small>${b.passenger_phone || ''}</small></td>
        <td style="max-width:200px;font-size:0.8rem;">${route}</td>
        <td>${esc(b.vehicle_name || '—')}</td>
        <td><strong>$${parseFloat(b.total_price).toFixed(2)}</strong></td>
        <td><span class="limo-status-pill ${statusClass(b.status)}">${esc(b.status)}</span></td>
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
        <p><strong>${esc(b.booking_number)}</strong></p>
        <p>📍 <strong>Pickup:</strong> ${b.pickup_address}</p>
        ${b.dropoff_address ? `<p>📍 <strong>Drop-off:</strong> ${b.dropoff_address}</p>` : ''}
        <p>📅 <strong>Date/Time:</strong> ${esc(b.pickup_date)} at ${esc(b.pickup_time)}</p>
        <p>👤 <strong>Passenger:</strong> ${esc(b.passenger_first_name)} ${esc(b.passenger_last_name)}</p>
        <p>📧 <strong>Email:</strong> ${b.passenger_email || '—'}</p>
        <p>📞 <strong>Phone:</strong> ${b.passenger_phone || '—'}</p>
        ${b.flight_number ? `<p>✈️ <strong>Flight:</strong> ${esc(b.flight_number)}</p>` : ''}
        ${b.meet_and_greet ? `<p>🪧 <strong>VIP Service:</strong> Meet &amp; Greet inside terminal ($30.00)</p>` : ''}
        ${Number(b.child_seats) > 0 ? `<p>👶 <strong>Child Seats:</strong> ${b.child_seats} provided</p>` : ''}
        <p>🚗 <strong>Vehicle:</strong> ${b.vehicle_name || b.vehicle_id}</p>
        <p>💰 <strong>Total:</strong> $${parseFloat(b.total_price).toFixed(2)} (${b.payment_status})</p>
        <div style="background:#f8fafc;padding:8px 12px;border-radius:6px;margin:8px 0;font-size:0.8rem;color:#475569;">
          <div>Base: $${Number(b.base_price || 0).toFixed(2)} | Tolls: $${Number(b.tolls || 0).toFixed(2)}</div>
          <div>Airport Fee: $${Number(b.airport_fee || 0).toFixed(2)} | Gratuity: $${Number(b.gratuity || 0).toFixed(2)}</div>
        </div>
        ${b.trip_notes ? `<p>📝 <strong>Trip Notes:</strong> ${b.trip_notes}</p>` : ''}
        ${b.internal_notes ? `<p>🔒 <strong>Internal Notes:</strong> ${b.internal_notes}</p>` : ''}
        <div style="margin-top:12px;">
          <select id="detail-status" style="padding:6px;border-radius:6px;border:1px solid #ddd;">
            ${['pending_operator','offering','operator_accepted','confirmed','dispatched','en_route','at_pickup','in_progress','completed','cancelled'].map((s) =>
              `<option value="${s}" ${s === b.status ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
          <button class="limo-btn limo-btn-gold" style="padding:6px 14px;font-size:0.75rem;margin-left:8px;" onclick="saveStatus(${b.id})">Save Status</button>
${['pending_operator','offering'].includes(b.status) ? '          <button class="limo-btn limo-btn-outline" style="padding:6px 14px;font-size:.75rem;margin-left:8px;" onclick="dispatchBooking(${b.id})">Send offers to verified operators</button>' : ''}
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
  }

  async function loadPartnerApplications() {
    const tbody = document.getElementById('partner-apps-tbody');
    if (!tbody) return;
    try {
      const data = await api('/erp/partner-applications');
      if (!data?.applications?.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#94a3b8;padding:16px;">No partner applications submitted yet.</td></tr>';
        return;
      }
      tbody.innerHTML = data.applications.map((a) => `
        <tr style="border-bottom:1px solid #eee;">
          <td>${new Date(a.created_at).toLocaleDateString()}</td>
          <td><span style="font-weight:700;text-transform:uppercase;font-size:0.75rem;padding:3px 8px;border-radius:4px;background:#e2e8f0;">${esc(a.applicant_type)}</span></td>
          <td><strong>${esc(a.full_name)}</strong>${a.company_name ? `<br><small style="color:#64748b;">${esc(a.company_name)}</small>` : ''}</td>
          <td><a href="tel:${esc(a.phone)}">${esc(a.phone)}</a><br><a href="mailto:${esc(a.email)}" style="font-size:0.78rem;">${esc(a.email)}</a></td>
          <td>${esc(a.vehicle_year || '')} ${esc(a.vehicle_name || '')}<br><small style="color:#64748b;">${esc(a.vehicle_type || '')} · ${esc(a.vehicle_color || '')}</small></td>
          <td>${esc(a.license_number || '—')}</td>
          <td><small style="color:#64748b;">${esc(a.dispatch_software || 'Independent')}</small></td>
          <td><span style="padding:3px 8px;border-radius:4px;font-size:0.75rem;font-weight:700;${a.status === 'approved' ? 'background:#dcfce7;color:#166534;' : a.status === 'rejected' ? 'background:#fee2e2;color:#991b1b;' : 'background:#fef3c7;color:#92400e;'}">${esc(a.status)}</span></td>
          <td>
            ${a.status === 'pending_review' ? `
              <div style="display:flex;gap:4px;">
                <button class="limo-btn limo-btn-gold" style="padding:4px 8px;font-size:0.75rem;" data-app-action="approved" data-app-id="${a.id}">Approve</button>
                <button class="limo-btn limo-btn-outline" style="padding:4px 8px;font-size:0.75rem;" data-app-action="rejected" data-app-id="${a.id}">Reject</button>
              </div>
            ` : '—'}
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('button[data-app-action]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-app-id');
          const status = btn.getAttribute('data-app-action');
          btn.disabled = true;
          try {
            await api('/erp/partner-applications/' + id, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status })
            });
            loadPartnerApplications();
          } catch (e) {
            alert(e.message);
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#ef4444;padding:16px;">Failed to load applications: ' + esc(err.message) + '</td></tr>';
    }
  }

  document.getElementById('btn-refresh-apps')?.addEventListener('click', loadPartnerApplications);

  document.getElementById('btn-search-carriers')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-search-carriers');
    const state = document.getElementById('outreach-state')?.value || 'NY';
    const tbody = document.getElementById('carriers-tbody');
    if (!tbody) return;
    btn.disabled = true;
    btn.textContent = 'Searching FMCSA...';
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px;">Searching passenger carriers in ' + state + '…</td></tr>';

    try {
      const data = await api('/erp/passenger-carriers?state=' + state + '&limit=30');
      if (!data?.carriers?.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#94a3b8;padding:16px;">No passenger carriers found for ' + state + '.</td></tr>';
        btn.disabled = false;
        btn.textContent = '🔍 Search Passenger Carriers';
        return;
      }
      tbody.innerHTML = data.carriers.map((c) => `
        <tr style="border-bottom:1px solid #eee;">
          <td><strong>${esc(c.dot_number)}</strong></td>
          <td><strong>${esc(c.legal_name)}</strong>${c.dba_name ? `<br><small style="color:#64748b;">DBA: ${esc(c.dba_name)}</small>` : ''}</td>
          <td>${esc(c.company_officer_1 || '—')}</td>
          <td>${esc(c.phy_city || '')}, ${esc(c.phy_state || '')}</td>
          <td>${esc(c.power_units || '—')}</td>
          <td><a href="tel:${esc(c.phone)}">${esc(c.phone || '—')}</a></td>
          <td><a href="mailto:${esc(c.email_address)}" style="font-size:0.8rem;">${esc(c.email_address || '—')}</a></td>
          <td>
            <div style="display:flex;gap:6px;">
              ${c.email_address ? `<button class="limo-btn limo-btn-gold" style="padding:4px 8px;font-size:0.75rem;" data-invite="email" data-email="${esc(c.email_address)}" data-company="${esc(c.legal_name)}" data-phone="${esc(c.phone || '')}">✉️ Email Invite</button>` : ''}
              ${c.phone ? `<button class="limo-btn limo-btn-dark" style="padding:4px 8px;font-size:0.75rem;" data-invite="sms" data-email="${esc(c.email_address || '')}" data-company="${esc(c.legal_name)}" data-phone="${esc(c.phone)}">💬 SMS Invite</button>` : ''}
            </div>
          </td>
        </tr>
      `).join('');

      tbody.querySelectorAll('button[data-invite]').forEach((invBtn) => {
        invBtn.addEventListener('click', async () => {
          const method = invBtn.getAttribute('data-invite');
          const email = invBtn.getAttribute('data-email');
          const phone = invBtn.getAttribute('data-phone');
          const companyName = invBtn.getAttribute('data-company');
          invBtn.disabled = true;
          invBtn.textContent = 'Sending...';

          try {
            const res = await api('/erp/invite-carrier', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email, phone, companyName, method })
            });
            invBtn.textContent = method === 'email' ? 'Invited ✓' : 'Sent SMS ✓';
            invBtn.style.background = '#22c55e';
            invBtn.style.color = '#fff';
          } catch (e) {
            alert('Failed to send invitation: ' + e.message);
            invBtn.disabled = false;
            invBtn.textContent = method === 'email' ? '✉️ Email Invite' : '💬 SMS Invite';
          }
        });
      });
    } catch (err) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#ef4444;padding:16px;">Error searching carriers: ' + esc(err.message) + '</td></tr>';
    } finally {
      btn.disabled = false;
      btn.textContent = '🔍 Search Passenger Carriers';
    }
  });

  // Call loadPartnerApplications during init
  const origInit = init;
  init = async function() {
    await origInit();
    loadPartnerApplications();
  };

  init();
})();

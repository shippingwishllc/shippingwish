// Shipping Wish Enterprise TMS Client Logic

// Format Currency
function formatCurrency(num) {
  return '$' + parseFloat(num || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Format Date
function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Status Badge Builder
function renderStatusBadge(status) {
  const label = (status || 'new').replace('_', ' ');
  return `<span class="badge badge-${status}">${label}</span>`;
}

// Load Dashboard Analytics Stats
async function loadDashboardStats(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const res = await fetch('/api/dashboard/stats');
    const data = await res.json();

    if (data.role === 'super_admin') {
      container.innerHTML = `
        <div class="stat-card">
          <span class="eyebrow">Gross Revenue</span>
          <div class="val">${formatCurrency(data.totalRevenue)}</div>
          <span class="sub">Margin: ${formatCurrency(data.grossMargin)}</span>
        </div>
        <div class="stat-card">
          <span class="eyebrow">Active Loads</span>
          <div class="val">${data.activeLoads}</div>
          <span class="sub">Total Loads: ${data.totalLoads}</span>
        </div>
        <div class="stat-card">
          <span class="eyebrow">Paid Revenue</span>
          <div class="val">${formatCurrency(data.paidRevenue)}</div>
          <span class="sub">${data.paidInvoicesCount} paid invoices</span>
        </div>
        <div class="stat-card">
          <span class="eyebrow">Pending Payments</span>
          <div class="val">${formatCurrency(data.pendingRevenue)}</div>
          <span class="sub">${data.pendingInvoicesCount} pending invoices</span>
        </div>
      `;
    } else if (data.role === 'dispatcher') {
      container.innerHTML = `
        <div class="stat-card">
          <span class="eyebrow">Today's Loads</span>
          <div class="val">${data.todayLoads}</div>
          <span class="sub">Active: ${data.activeLoads}</span>
        </div>
        <div class="stat-card">
          <span class="eyebrow">Completed Loads</span>
          <div class="val">${data.completedLoads}</div>
          <span class="sub">Pending Docs: ${data.pendingDocs}</span>
        </div>
        <div class="stat-card">
          <span class="eyebrow">Today's Pickups</span>
          <div class="val">${data.upcomingPickups}</div>
        </div>
        <div class="stat-card">
          <span class="eyebrow">Today's Deliveries</span>
          <div class="val">${data.upcomingDeliveries}</div>
        </div>
      `;
    } else if (data.role === 'carrier') {
      container.innerHTML = `
        <div class="stat-card">
          <span class="eyebrow">Active Loads</span>
          <div class="val">${data.activeLoads}</div>
          <span class="sub">Completed: ${data.completedLoads}</span>
        </div>
        <div class="stat-card">
          <span class="eyebrow">Total Revenue Earned</span>
          <div class="val">${formatCurrency(data.totalEarned)}</div>
        </div>
        <div class="stat-card">
          <span class="eyebrow">Pending Payments</span>
          <div class="val">${formatCurrency(data.pendingPayment)}</div>
        </div>
        <div class="stat-card">
          <span class="eyebrow">Dispatcher Contact</span>
          <div class="val" style="font-size:16px;margin-top:8px;">${data.dispatcherContact.name}</div>
          <span class="sub">${data.dispatcherContact.phone}</span>
        </div>
      `;
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// Load List Renderer
async function loadTableLoads(tableId, isDispatcherOrAdmin = false) {
  const tableEl = document.getElementById(tableId);
  if (!tableEl) return;
  const tbody = tableEl.querySelector('tbody');

  try {
    const res = await fetch('/api/loads');
    const data = await res.json();
    const loads = data.loads || [];

    if (!loads.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center;">No loads found for your account.</td></tr>`;
      return;
    }

    tbody.innerHTML = loads.map(l => {
      const isDelivered = ['delivered', 'pod_uploaded', 'invoiced', 'paid'].includes(l.status);
      return `
        <tr>
          <td><a href="/load-detail.html?id=${l.id}" style="color:var(--amber-primary);font-weight:600;">${l.load_number}</a></td>
          <td>${l.carrier_company || l.carrier_name || '-'}</td>
          <td>${l.broker_name || '-'}</td>
          <td>${l.pickup_location || '-'} (${formatDate(l.pickup_date)})</td>
          <td>${l.delivery_location || '-'} (${formatDate(l.delivery_date)})</td>
          <td style="font-weight:600;">${formatCurrency(l.rate || l.carrier_pay)}</td>
          <td>${renderStatusBadge(l.status)}</td>
          <td style="display:flex;gap:6px;align-items:center;">
            <a href="/load-detail.html?id=${l.id}" class="btn btn-outline btn-sm">View</a>
            ${!isDelivered ? `
              <button class="btn btn-amber btn-sm" onclick="quickMarkDelivered(${l.id}, '${tableId}')">Mark Delivered</button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Load table error:', err);
    tbody.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center;">Error loading loads.</td></tr>`;
  }
}

// Quick Mark Delivered Action
async function quickMarkDelivered(loadId, tableId) {
  if (!confirm('Mark this load as Delivered? It will move out of Active Loads into Completed Loads.')) return;
  try {
    const res = await fetch(`/api/loads/${loadId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'delivered', notes: 'Marked as delivered via quick action' })
    });
    if (res.ok) {
      loadTableLoads(tableId, true);
      loadDashboardStats('disp-stats-row');
      loadDashboardStats('carrier-stats-row');
      loadDashboardStats('admin-stats-row');
    }
  } catch (err) {
    alert('Could not update status.');
  }
}

// Populate Select Options for Carrier, Driver, Truck, Trailer, Broker
async function populateLoadFormDropdowns() {
  const carrierSelect = document.getElementById('carrierId');
  if (carrierSelect) {
    const res = await fetch('/api/carriers');
    const data = await res.json();
    carrierSelect.innerHTML = `<option value="">-- Select Carrier Company --</option>` +
      (data.carriers || []).map(c => `<option value="${c.id}">${c.company_name || c.name} (${c.mc_number || 'No MC'})</option>`).join('');
  }

  const brokerSelect = document.getElementById('brokerId');
  if (brokerSelect) {
    const res = await fetch('/api/brokers');
    const data = await res.json();
    brokerSelect.innerHTML = `<option value="">-- Select Registered Broker --</option>` +
      (data.brokers || []).map(b => `<option value="${b.id}">${b.company_name} (MC: ${b.mc_number || 'N/A'})</option>`).join('');
  }

  const driverSelect = document.getElementById('driverId');
  if (driverSelect) {
    const res = await fetch('/api/fleet/drivers');
    const data = await res.json();
    driverSelect.innerHTML = `<option value="">-- Select Driver --</option>` +
      (data.drivers || []).map(d => `<option value="${d.id}">${d.name} (${d.phone || 'No phone'})</option>`).join('');
  }

  const truckSelect = document.getElementById('truckId');
  if (truckSelect) {
    const res = await fetch('/api/fleet/trucks');
    const data = await res.json();
    truckSelect.innerHTML = `<option value="">-- Select Truck --</option>` +
      (data.trucks || []).map(t => `<option value="${t.id}">Truck #${t.truck_number} (${t.vin || 'No VIN'})</option>`).join('');
  }

  const trailerSelect = document.getElementById('trailerId');
  if (trailerSelect) {
    const res = await fetch('/api/fleet/trailers');
    const data = await res.json();
    trailerSelect.innerHTML = `<option value="">-- Select Trailer --</option>` +
      (data.trailers || []).map(tr => `<option value="${tr.id}">Trailer #${tr.trailer_number} (${tr.type})</option>`).join('');
  }
}

// Global Modal Handlers
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-open-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-open-modal');
      const targetModal = document.getElementById(targetId);
      if (targetModal) targetModal.classList.add('active');
    });
  });

  document.querySelectorAll('[data-close-modal], .modal-overlay').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target === el || el.hasAttribute('data-close-modal')) {
        const modal = el.closest('.modal-overlay');
        if (modal) modal.classList.remove('active');
      }
    });
  });
});

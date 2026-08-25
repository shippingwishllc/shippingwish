document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadDriversAndTrucks();
  await loadPlans();
});

async function checkAuth() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) { window.location.href = '/login'; return; }
    const data = await res.json();
    const user = data.user;
    if (!user) { window.location.href = '/login'; return; }

    const disp = document.getElementById('user-display-name');
    if (disp) disp.textContent = user.name || user.email;

    const roleDisp = document.getElementById('lp-user-role');
    if (roleDisp) roleDisp.textContent = (user.role || 'Planner').toUpperCase();

    const initials = document.getElementById('lp-avatar-initials');
    if (initials) initials.textContent = (user.name || 'LP').slice(0, 2).toUpperCase();
  } catch (err) {
    window.location.href = '/login';
  }
}

async function loadDriversAndTrucks() {
  try {
    const [dRes, tRes] = await Promise.all([
      fetch('/api/fleet/drivers', { credentials: 'include' }),
      fetch('/api/fleet/trucks', { credentials: 'include' })
    ]);

    if (dRes.ok) {
      const dData = await dRes.json();
      const dSelect = document.getElementById('plan-driver-id');
      dSelect.innerHTML = '<option value="">Choose driver...</option>' + (dData.drivers || []).map(d => `
        <option value="${d.id}">${escapeHtml(d.name)} (${d.phone || 'No phone'})</option>
      `).join('');
    }

    if (tRes.ok) {
      const tData = await tRes.json();
      const tSelect = document.getElementById('plan-truck-id');
      tSelect.innerHTML = '<option value="">Choose truck...</option>' + (tData.trucks || []).map(t => `
        <option value="${t.id}">Truck #${escapeHtml(t.truck_number || 'N/A')} (${escapeHtml(t.equipment_type || '53ft Dry Van')})</option>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading drivers/trucks:', err);
  }
}

async function loadPlans() {
  try {
    const res = await fetch('/api/load-planning', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      const plans = data.load_plans || [];
      renderPlans(plans);
      updateKPIs(plans);
    } else {
      renderMockPlans();
    }
  } catch (err) {
    renderMockPlans();
  }
}

function updateKPIs(plans) {
  const scheduled = plans.filter(p => p.status === 'scheduled').length;
  const todayStr = new Date().toISOString().split('T')[0];
  const readyToday = plans.filter(p => (p.available_date || '').startsWith(todayStr)).length;
  const fleets = new Set(plans.map(p => p.carrier_id)).size || plans.length;

  document.getElementById('kpi-scheduled-count').textContent = scheduled || plans.length;
  document.getElementById('kpi-ready-today').textContent = readyToday;
  document.getElementById('kpi-covered-fleets').textContent = fleets;
}

function renderPlans(plans) {
  const tbody = document.getElementById('plans-table-body');
  if (!plans.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">No upcoming driver availability schedules recorded yet. Click "+ Schedule Driver Availability" above to add one.</td></tr>`;
    return;
  }

  tbody.innerHTML = plans.map(p => {
    const badgeClass = 
      p.status === 'booked' ? 'badge-paid' :
      p.status === 'completed' ? 'badge-new' : 'badge-booked';

    const availDateStr = new Date(p.available_date).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });

    return `
      <tr>
        <td>
          <strong style="color:var(--text-primary);font-size:14px;">${escapeHtml(p.driver_name)}</strong><br>
          <span class="badge badge-amber" style="margin-top:4px;">🚛 Truck #${escapeHtml(p.truck_number)}</span>
        </td>
        <td>
          <strong style="color:var(--color-amber-400);">📅 ${availDateStr}</strong>
        </td>
        <td>
          <strong style="color:var(--text-primary);">📍 ${escapeHtml(p.pickup_location)}</strong>
        </td>
        <td>
          <span style="font-size:13px;color:var(--text-muted);">${escapeHtml(p.delivery_preference || 'Any High-Paying Lane')}</span>
        </td>
        <td>
          <span style="font-size:12px;color:var(--text-muted);">${escapeHtml(p.notes || '-')}</span>
        </td>
        <td>
          <span class="badge ${badgeClass}">${escapeHtml((p.status || 'scheduled').toUpperCase())}</span>
        </td>
        <td>
          <div style="display:flex;gap:6px;">
            ${p.status === 'scheduled' ? `
              <button class="btn btn-primary btn-sm" onclick="updatePlanStatus(${p.id}, 'booked')">📌 Mark Booked</button>
            ` : ''}
            ${p.status !== 'completed' ? `
              <button class="btn btn-secondary btn-sm" onclick="updatePlanStatus(${p.id}, 'completed')">✅ Complete</button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderMockPlans() {
  const mock = [
    { id: 101, driver_name: 'David Miller', truck_number: '1042', available_date: new Date(Date.now() + 86400000).toISOString(), pickup_location: 'Dallas, TX', delivery_preference: 'Chicago, IL or Midwest', notes: 'Taking weekend off, ready Monday 7 AM', status: 'scheduled' },
    { id: 102, driver_name: 'Robert Vance', truck_number: '2091', available_date: new Date(Date.now() + 172800000).toISOString(), pickup_location: 'Atlanta, GA', delivery_preference: 'Florida or Southeast Regional', notes: 'Home time ending Sunday evening', status: 'scheduled' },
    { id: 103, driver_name: 'Marcus Vance', truck_number: '3018', available_date: new Date().toISOString(), pickup_location: 'Columbus, OH', delivery_preference: 'East Coast Dry Van', notes: 'Reload booked by dispatcher', status: 'booked' }
  ];
  renderPlans(mock);
  updateKPIs(mock);
}

async function updatePlanStatus(planId, newStatus) {
  try {
    const res = await fetch(`/api/load-planning/${planId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      await loadPlans();
    }
  } catch (err) {
    console.error('Error updating plan status:', err);
  }
}

function openAddPlanModal() {
  const modal = document.getElementById('add-plan-modal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('open');
  }
  const alertDiv = document.getElementById('plan-alert');
  if (alertDiv) alertDiv.style.display = 'none';
}

function closeAddPlanModal() {
  const modal = document.getElementById('add-plan-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('open');
  }
  document.getElementById('add-plan-form').reset();
}

window.openAddPlanModal = openAddPlanModal;
window.closeAddPlanModal = closeAddPlanModal;
window.updatePlanStatus = updatePlanStatus;

document.getElementById('add-plan-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-save-plan');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  const body = {
    driver_id: document.getElementById('plan-driver-id').value,
    truck_id: document.getElementById('plan-truck-id').value,
    available_date: document.getElementById('plan-date').value,
    pickup_location: document.getElementById('plan-pickup').value,
    delivery_preference: document.getElementById('plan-delivery-pref').value,
    notes: document.getElementById('plan-notes').value
  };

  try {
    const res = await fetch('/api/load-planning', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body)
    });
    if (res.ok) {
      closeAddPlanModal();
      await loadPlans();
    } else {
      const data = await res.json();
      const alertDiv = document.getElementById('plan-alert');
      alertDiv.style.display = 'block';
      alertDiv.textContent = data.error || 'Could not save availability schedule.';
    }
  } catch (err) {
    alert('Network error. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Availability Schedule →';
  }
});

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

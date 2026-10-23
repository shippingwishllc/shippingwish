let cachedDrivers = [];
let cachedTrucks = [];

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadDriversAndTrucks();
  await loadPlans();
  bindModalListeners();
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

function normalizeEquipmentOption(rawEq) {
  const s = String(rawEq || '').toLowerCase();
  if (s.includes('30') && s.includes('hotshot')) return '30ft Hotshot';
  if (s.includes('35') && s.includes('hotshot')) return '35ft Hotshot';
  if (s.includes('40') && s.includes('hotshot')) return '40ft Hotshot';
  if (s.includes('hotshot')) return '30ft Hotshot';
  if (s.includes('reefer')) return '53ft Reefer';
  if (s.includes('48') && s.includes('flatbed')) return '48ft Flatbed';
  if (s.includes('flatbed')) return '53ft Flatbed';
  if (s.includes('step')) return 'Step Deck';
  if (s.includes('box')) return '26ft Box Truck';
  if (s.includes('sprinter') || s.includes('cargo')) return 'Sprinter Van';
  if (s.includes('power')) return 'Power Only';
  if (s.includes('rgn') || s.includes('lowboy')) return 'RGN / Lowboy';
  if (s.includes('auto') || s.includes('car')) return 'Auto Hauler';
  return '53ft Dry Van';
}

async function loadDriversAndTrucks() {
  try {
    const [dRes, tRes] = await Promise.all([
      fetch('/api/fleet/drivers', { credentials: 'include' }),
      fetch('/api/fleet/trucks', { credentials: 'include' })
    ]);

    if (dRes.ok) {
      const dData = await dRes.json();
      cachedDrivers = dData.drivers || [];
      const dSelect = document.getElementById('plan-driver-id');
      if (dSelect) {
        const prev = dSelect.value;
        dSelect.innerHTML = '<option value="">Choose driver...</option>' + cachedDrivers.map(d => {
          const comp = d.carrier_company || d.carrier_name || '';
          const eq = d.equipment_type || '53ft Dry Van';
          const truckTag = d.truck_number ? `Truck #${d.truck_number}` : '';
          const meta = [comp, `🚛 ${eq}`, truckTag, d.phone].filter(Boolean).join(' • ');
          return `<option value="${d.id}">${escapeHtml(d.name)} — ${escapeHtml(meta)}</option>`;
        }).join('');
        if (prev) dSelect.value = prev;
      }
    }

    if (tRes.ok) {
      const tData = await tRes.json();
      cachedTrucks = tData.trucks || [];
      const tSelect = document.getElementById('plan-truck-id');
      if (tSelect) {
        const prevT = tSelect.value;
        tSelect.innerHTML = '<option value="">Choose truck...</option>' + cachedTrucks.map(t => {
          const comp = t.carrier_company || t.carrier_name || '';
          const eq = t.equipment_type || '53ft Dry Van';
          return `<option value="${t.id}">Truck #${escapeHtml(t.truck_number || '101')} — ${escapeHtml(eq)}${comp ? ' (' + escapeHtml(comp) + ')' : ''}</option>`;
        }).join('');
        if (prevT) tSelect.value = prevT;
      }
    }
  } catch (err) {
    console.error('Error loading drivers/trucks:', err);
  }
}

function updateSelectedDriverBanner() {
  const dSelect = document.getElementById('plan-driver-id');
  const tSelect = document.getElementById('plan-truck-id');
  const eqSelect = document.getElementById('plan-equipment-type');
  const banner = document.getElementById('plan-driver-equipment-banner');
  if (!banner) return;

  const driver = cachedDrivers.find(d => String(d.id) === String(dSelect ? dSelect.value : ''));
  const truck = cachedTrucks.find(t => String(t.id) === String(tSelect ? tSelect.value : ''));
  if (!driver && !truck) {
    banner.style.display = 'none';
    return;
  }

  const eq = (eqSelect && eqSelect.value) || (truck && truck.equipment_type) || (driver && driver.equipment_type) || '53ft Dry Van';
  const company = (driver && (driver.carrier_company || driver.carrier_name)) || (truck && (truck.carrier_company || truck.carrier_name)) || 'Carrier Fleet';
  const phone = (driver && driver.phone) ? ` • 📞 ${escapeHtml(driver.phone)}` : '';
  const truckNum = truck ? `Truck #${escapeHtml(truck.truck_number || '101')}` : (driver && driver.truck_number ? `Truck #${escapeHtml(driver.truck_number)}` : 'Assigned Unit');

  banner.style.display = 'block';
  banner.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div>
        <strong>👤 ${escapeHtml(driver ? driver.name : company)}</strong>
        <span style="color:var(--text-muted);"> (${escapeHtml(company)}${phone})</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="badge badge-amber">🚛 ${truckNum}</span>
        <span class="badge badge-paid">🔥 ${escapeHtml(eq)}</span>
      </div>
    </div>
  `;
}

function bindModalListeners() {
  const dSelect = document.getElementById('plan-driver-id');
  const tSelect = document.getElementById('plan-truck-id');
  const eqSelect = document.getElementById('plan-equipment-type');

  if (dSelect) {
    dSelect.addEventListener('change', () => {
      const driver = cachedDrivers.find(d => String(d.id) === String(dSelect.value));
      if (driver) {
        // Auto-select assigned truck or first truck belonging to the same carrier
        let targetTruck = null;
        if (driver.assigned_truck_id) {
          targetTruck = cachedTrucks.find(t => String(t.id) === String(driver.assigned_truck_id));
        }
        if (!targetTruck && driver.carrier_id) {
          targetTruck = cachedTrucks.find(t => String(t.carrier_id) === String(driver.carrier_id));
        }
        if (targetTruck && tSelect) {
          tSelect.value = String(targetTruck.id);
        }
        const eq = (targetTruck && targetTruck.equipment_type) || driver.equipment_type || '53ft Dry Van';
        if (eqSelect) eqSelect.value = normalizeEquipmentOption(eq);
      }
      updateSelectedDriverBanner();
    });
  }

  if (tSelect) {
    tSelect.addEventListener('change', () => {
      const truck = cachedTrucks.find(t => String(t.id) === String(tSelect.value));
      if (truck && eqSelect && truck.equipment_type) {
        eqSelect.value = normalizeEquipmentOption(truck.equipment_type);
      }
      updateSelectedDriverBanner();
    });
  }

  if (eqSelect) {
    eqSelect.addEventListener('change', () => {
      updateSelectedDriverBanner();
    });
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
      const tbody = document.getElementById('plans-table-body');
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">Could not load availability. Sign in again.</td></tr>`;
    }
  } catch (err) {
    const tbody = document.getElementById('plans-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted);">Could not load availability.</td></tr>`;
  }
}

function updateKPIs(plans) {
  const scheduled = plans.filter(p => p.status === 'scheduled').length;
  const todayStr = new Date().toISOString().split('T')[0];
  const readyToday = plans.filter(p => (p.available_date || '').startsWith(todayStr)).length;
  const fleets = new Set(plans.map(p => p.carrier_company || p.driver_id)).size || plans.length;

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

    const eq = p.equipment_type || '53ft Dry Van';
    const company = p.carrier_company ? `<span style="font-size:11.5px;color:var(--text-muted);"> • ${escapeHtml(p.carrier_company)}</span>` : '';

    return `
      <tr>
        <td>
          <strong style="color:var(--text-primary);font-size:14px;">${escapeHtml(p.driver_name)}</strong>${company}<br>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;">
            <span class="badge badge-amber">🚛 Truck #${escapeHtml(p.truck_number)}</span>
            <span class="badge badge-paid">${escapeHtml(eq)}</span>
          </div>
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

async function openAddPlanModal() {
  const modal = document.getElementById('add-plan-modal');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('open');
  }
  const alertDiv = document.getElementById('plan-alert');
  if (alertDiv) alertDiv.style.display = 'none';
  await loadDriversAndTrucks();
  updateSelectedDriverBanner();
}

function closeAddPlanModal() {
  const modal = document.getElementById('add-plan-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('open');
  }
  document.getElementById('add-plan-form').reset();
  const banner = document.getElementById('plan-driver-equipment-banner');
  if (banner) banner.style.display = 'none';
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
    equipment_type: document.getElementById('plan-equipment-type') ? document.getElementById('plan-equipment-type').value : null,
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
      await loadDriversAndTrucks();
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

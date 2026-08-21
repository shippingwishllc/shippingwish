document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadDriversAndTrucks();
  await loadPlans();
});

async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    document.getElementById('user-display-name').textContent = `${data.user.name} (${data.user.role})`;
  } catch (err) {
    window.location.href = '/login.html';
  }
}

async function loadDriversAndTrucks() {
  try {
    const [dRes, tRes] = await Promise.all([
      fetch('/api/fleet/drivers'),
      fetch('/api/fleet/trucks')
    ]);

    if (dRes.ok) {
      const dData = await dRes.json();
      const dSelect = document.getElementById('plan-driver-id');
      (dData.drivers || []).forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = `${d.name} (${d.phone})`;
        dSelect.appendChild(opt);
      });
    }

    if (tRes.ok) {
      const tData = await tRes.json();
      const tSelect = document.getElementById('plan-truck-id');
      (tData.trucks || []).forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `Truck #${t.truck_number} (${t.equipment_type || '53ft Dry Van'})`;
        tSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.error('Error loading drivers/trucks:', err);
  }
}

async function loadPlans() {
  try {
    const res = await fetch('/api/load-planning');
    if (res.ok) {
      const data = await res.json();
      renderPlans(data.load_plans || []);
    }
  } catch (err) {
    console.error('Error loading load plans:', err);
  }
}

function renderPlans(plans) {
  const tbody = document.getElementById('plans-table-body');
  if (plans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;" class="muted">No upcoming driver availability schedules recorded yet. Click "+ Schedule Driver Availability" above to add one.</td></tr>`;
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
          <b style="color:#fff;font-size:15px;">${escapeHtml(p.driver_name)}</b><br>
          <span class="badge badge-booked">🚛 Truck #${escapeHtml(p.truck_number)}</span>
        </td>
        <td>
          <b style="color:var(--amber-primary);font-size:14px;">📅 ${availDateStr}</b>
        </td>
        <td>
          <b style="color:#fff;">📍 ${escapeHtml(p.pickup_location)}</b>
        </td>
        <td>
          <span class="muted" style="font-size:13px;">${escapeHtml(p.delivery_preference || 'Any High-Paying Lane')}</span>
        </td>
        <td>
          <span style="font-size:12px;color:var(--text-muted);">${escapeHtml(p.notes || '-')}</span>
        </td>
        <td>
          <span class="badge ${badgeClass}">${escapeHtml(p.status.toUpperCase())}</span>
        </td>
        <td>
          <div style="display:flex;gap:6px;">
            ${p.status === 'scheduled' ? `
              <button class="btn btn-amber btn-sm" onclick="updatePlanStatus(${p.id}, 'booked')">📌 Mark Booked</button>
            ` : ''}
            ${p.status !== 'completed' ? `
              <button class="btn btn-outline btn-sm" onclick="updatePlanStatus(${p.id}, 'completed')">✅ Complete</button>
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
  document.getElementById('add-plan-modal').style.display = 'flex';
}

function closeAddPlanModal() {
  document.getElementById('add-plan-modal').style.display = 'none';
}

document.getElementById('add-plan-form').addEventListener('submit', async (e) => {
  e.preventDefault();
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
      body: JSON.stringify(body)
    });
    if (res.ok) {
      closeAddPlanModal();
      e.target.reset();
      await loadPlans();
      alert('✅ Driver availability schedule saved successfully!');
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to schedule load plan');
    }
  } catch (err) {
    alert('Error saving load plan');
  }
});

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function logout() {
  fetch('/api/logout', { method: 'POST' }).then(() => {
    window.location.href = '/login.html';
  });
}

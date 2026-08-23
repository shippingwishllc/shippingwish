let currentUser = null;
let allLoadsData = [];

async function initAdmin() {
  currentUser = await checkAuth(['super_admin', 'admin']);
  if (!currentUser) return;

  document.getElementById('user-badge').textContent = `${currentUser.name} (${currentUser.role})`;
  loadDashboardStats('admin-stats-row');
  populateCarrierFilter();
  fetchAdminLoads();
  loadCarriersTab();
  loadEmployeesTab();
  loadAssignmentsTab();
  loadUsersList();
  loadPerformanceTables();
}

function switchAdminTab(tabName) {
  document.querySelectorAll('.tms-tabs .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sidebar-item').forEach(b => b.classList.remove('active'));

  const tabs = ['loads', 'carriers', 'hr', 'assignments', 'users', 'performance'];
  tabs.forEach(t => {
    const el = document.getElementById(`tab-${t}`);
    if (el) el.style.display = 'none';
  });

  const targetTab = document.getElementById(`tab-${tabName}`);
  if (targetTab) targetTab.style.display = 'block';

  const sideItem = document.getElementById(`side-item-${tabName}`);
  if (sideItem) sideItem.classList.add('active');
}

async function populateCarrierFilter() {
  const filterSelect = document.getElementById('carrier-filter');
  if (!filterSelect) return;
  const res = await fetch('/api/carriers');
  const data = await res.json();
  const carriers = data.carriers || [];

  filterSelect.innerHTML = `<option value="">-- All Carrier Companies --</option>` +
    carriers.map(c => `<option value="${c.id}">${escapeHtml(c.company_name || c.name)} (${escapeHtml(c.mc_number || 'No MC')})</option>`).join('');
}

async function fetchAdminLoads() {
  const tbody = document.querySelector('#admin-loads-table tbody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/loads');
    const data = await res.json();
    allLoadsData = data.loads || [];
    renderAdminLoads(allLoadsData);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted">Error loading loads.</td></tr>`;
  }
}

function filterAdminLoads() {
  const selectedCarrierId = document.getElementById('carrier-filter').value;
  if (!selectedCarrierId) {
    renderAdminLoads(allLoadsData);
  } else {
    const filtered = allLoadsData.filter(l => String(l.carrier_id) === String(selectedCarrierId));
    renderAdminLoads(filtered);
  }
}

function viewSingleCarrierLoads(carrierId) {
  document.getElementById('carrier-filter').value = carrierId;
  switchAdminTab('loads');
  filterAdminLoads();
}

function renderAdminLoads(loads) {
  const tbody = document.querySelector('#admin-loads-table tbody');
  if (!tbody) return;
  if (!loads.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="muted" style="text-align:center;">No loads found for selected criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = loads.map(l => `
    <tr>
      <td><a href="/load-detail.html?id=${l.id}" style="color:var(--amber-primary);font-weight:600;">${escapeHtml(l.load_number)}</a></td>
      <td><b>${escapeHtml(l.carrier_company || l.carrier_name || '-')}</b></td>
      <td>${escapeHtml(l.broker_name || '-')}</td>
      <td>${escapeHtml(l.pickup_location || '-')} (${formatDate(l.pickup_date)})</td>
      <td>${escapeHtml(l.delivery_location || '-')} (${formatDate(l.delivery_date)})</td>
      <td>
        <b style="color:var(--amber-primary);">${formatCurrency(l.rate)}</b>
        <br><small class="muted">$${l.rpm || '0.00'}/mi · Pay: ${formatCurrency(l.carrier_pay)}</small>
      </td>
      <td>${renderStatusBadge(l.status)}</td>
      <td>
        <a href="/load-detail.html?id=${l.id}" class="btn btn-outline btn-sm">Console</a>
      </td>
    </tr>
  `).join('');
}

async function loadCarriersTab() {
  const tbody = document.querySelector('#admin-carriers-table tbody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/carriers');
    const data = await res.json();
    const carriers = data.carriers || [];

    if (carriers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;" class="muted">No carrier companies registered.</td></tr>`;
      return;
    }

    tbody.innerHTML = carriers.map(c => {
      const equip = c.equipment_category || 'dry_van';
      const fee   = parseFloat(c.dispatch_fee_percent || 5.00);
      const equipLabel = { box_truck:'Box Truck', dry_van:'Dry Van', reefer:'Reefer', flatbed:'Flatbed', other:'Other' }[equip] || equip;

      return `
        <tr>
          <td>
            <b style="color:var(--text-primary);font-size:14px;">${escapeHtml(c.company_name || c.name)}</b>
            <div style="font-size:11px;color:var(--text-muted);">Owner: ${escapeHtml(c.name)}</div>
          </td>
          <td>
            <span class="equip-tag" style="background:#eff6ff;color:#1e40af;border-color:#bfdbfe;">MC: ${escapeHtml(c.mc_number || 'N/A')}</span>
            ${c.dot_number ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">DOT: ${escapeHtml(c.dot_number)}</div>` : ''}
          </td>
          <td>
            <span class="equip-tag">${escapeHtml(equipLabel)}</span>
          </td>
          <td>
            <strong style="color:var(--color-amber-600);font-size:14px;">${fee}% Fee</strong>
            ${c.billing_notes ? `<div style="font-size:10px;color:var(--text-muted);">${escapeHtml(c.billing_notes)}</div>` : ''}
          </td>
          <td>
            <div style="font-size:13px;font-weight:600;">📞 ${escapeHtml(c.phone || '-')}</div>
            <div style="font-size:11px;color:var(--text-muted);">✉️ ${escapeHtml(c.email || '-')}</div>
          </td>
          <td><span class="badge-status active">Active Client</span></td>
          <td>
            <div style="display:flex;gap:4px;">
              <button class="btn-table-action primary" onclick="editCarrierCommission(${c.id}, ${fee}, '${equip}', '${escapeHtml(c.billing_notes||'')}')">✏️ Edit Fee %</button>
              <button class="btn-table-action" onclick="viewSingleCarrierLoads(${c.id})">📊 Loads</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8">Error loading carriers.</td></tr>`;
  }
}

async function editCarrierCommission(carrierId, currentFee, currentEquip, currentNotes) {
  const feeStr = prompt(`Set Custom Dispatch Commission Rate (%) for carrier ID #${carrierId}:`, currentFee);
  if (feeStr === null) return;
  const newFee = parseFloat(feeStr);
  if (isNaN(newFee) || newFee < 0 || newFee > 50) {
    alert('Please enter a valid percentage between 0 and 50.');
    return;
  }

  const equipStr = prompt(`Set Equipment Type (box_truck, dry_van, reefer, flatbed, other):`, currentEquip) || currentEquip;
  const notesStr = prompt(`Billing notes (e.g. Agreed contract rate):`, currentNotes) || '';

  try {
    const res = await fetch(`/api/carriers/${carrierId}/commission`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dispatch_fee_percent: newFee,
        equipment_category: equipStr,
        billing_notes: notesStr
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message}`);
      loadCarriersTab();
    } else {
      alert(data.error || 'Failed to update commission rate');
    }
  } catch (e) {
    alert('Error updating carrier commission rate.');
  }
}

// ---- Employee HR & Salary Ledger Functions ----
async function loadEmployeesTab() {
  const tbody = document.getElementById('employees-table-body');
  if (!tbody) return;
  try {
    const res = await fetch('/api/employees');
    const data = await res.json();
    const employees = data.employees || [];

    if (employees.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;" class="muted">No internal employees found. Click "+ Add New Dispatcher / Sales Rep" above.</td></tr>`;
      return;
    }

    tbody.innerHTML = employees.map(e => `
      <tr>
        <td><b style="color:#fff;font-size:15px;">${escapeHtml(e.name)}</b></td>
        <td>
          <span class="badge ${e.role === 'dispatcher' ? 'badge-booked' : 'badge-paid'}">${escapeHtml(e.role.toUpperCase())}</span><br>
          <span class="muted" style="font-size:12px;">${escapeHtml(e.job_title || 'Staff')}</span>
        </td>
        <td>${escapeHtml(e.email)}</td>
        <td>
          <b style="color:var(--amber-primary);">$${parseFloat(e.salary || 0).toLocaleString()}</b> <span class="muted" style="font-size:12px;">/ ${escapeHtml(e.pay_frequency || 'mo')}</span>
        </td>
        <td>${formatDate(e.join_date)}</td>
        <td>
          ${e.is_suspended 
            ? '<span class="badge badge-unpaid">DEACTIVATED / SUSPENDED</span>' 
            : '<span class="badge badge-paid">ACTIVE EMPLOYEE</span>'}
        </td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn ${e.is_suspended ? 'btn-amber' : 'btn-outline'} btn-sm" onclick="toggleEmployeeActive(${e.id})">
              ${e.is_suspended ? '🟢 Activate' : '🔴 Suspend'}
            </button>
            <button class="btn btn-blue btn-sm" onclick="resetEmployeePassword(${e.id}, '${escapeHtml(e.name)}')">🔑 Password</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted">Error loading employees.</td></tr>`;
  }
}

async function toggleEmployeeActive(empId) {
  try {
    const res = await fetch(`/api/employees/${empId}/toggle-active`, { method: 'PUT' });
    if (res.ok) {
      await loadEmployeesTab();
      await loadUsersList();
    }
  } catch (err) {
    alert('Error toggling employee status');
  }
}

async function resetEmployeePassword(empId, empName) {
  const newPass = prompt(`Enter new password for ${empName} (minimum 6 characters):`);
  if (!newPass) return;
  if (newPass.length < 6) {
    alert('Password must be at least 6 characters.');
    return;
  }
  try {
    const res = await fetch(`/api/employees/${empId}/reset-password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password: newPass })
    });
    if (res.ok) {
      alert(`✅ Password for ${empName} updated successfully!`);
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to reset password');
    }
  } catch (err) {
    alert('Error resetting password');
  }
}

function openAddEmployeeModal() {
  document.getElementById('add-employee-modal').style.display = 'flex';
}

function closeAddEmployeeModal() {
  document.getElementById('add-employee-modal').style.display = 'none';
}

document.getElementById('add-employee-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    name: document.getElementById('emp-name').value,
    role: document.getElementById('emp-role').value,
    email: document.getElementById('emp-email').value,
    password: document.getElementById('emp-password').value,
    job_title: document.getElementById('emp-title').value,
    salary: parseFloat(document.getElementById('emp-salary').value || 0),
    notes: document.getElementById('emp-notes').value
  };

  try {
    const res = await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      closeAddEmployeeModal();
      e.target.reset();
      await loadEmployeesTab();
      await loadUsersList();
      alert('✅ Employee account & HR record created successfully!');
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to create employee');
    }
  } catch (err) {
    alert('Error creating employee account');
  }
});

// ---- Multi-Dispatcher Assignment Matrix Functions ----
async function loadAssignmentsTab() {
  const tbody = document.getElementById('assignments-table-body');
  if (!tbody) return;
  try {
    const res = await fetch('/api/employees/dispatcher-assignments');
    const data = await res.json();
    const assignments = data.assignments || [];

    if (assignments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:30px;" class="muted">No truck assignments configured yet. Click "+ Assign Truck to Dispatcher" above.</td></tr>`;
      return;
    }

    tbody.innerHTML = assignments.map(a => `
      <tr>
        <td><b style="color:#fff;font-size:15px;">👤 ${escapeHtml(a.dispatcher_name)}</b></td>
        <td><span class="badge badge-booked">🚛 Truck #${escapeHtml(a.truck_number)}</span></td>
        <td>${escapeHtml(a.driver_name || 'No driver assigned')} ${a.driver_phone ? '(' + escapeHtml(a.driver_phone) + ')' : ''}</td>
        <td><span class="badge badge-paid">${escapeHtml(a.shift_type.toUpperCase())}</span></td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="unassignTruck(${a.dispatcher_id}, ${a.truck_id})">Unassign</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted">Error loading assignments matrix.</td></tr>`;
  }
}

async function openAssignTruckModal() {
  document.getElementById('assign-truck-modal').style.display = 'flex';
  try {
    const [empRes, truckRes, driverRes] = await Promise.all([
      fetch('/api/employees'),
      fetch('/api/fleet/trucks'),
      fetch('/api/fleet/drivers')
    ]);

    const emps = (await empRes.json()).employees || [];
    const dispatchers = emps.filter(e => e.role === 'dispatcher');
    const dSelect = document.getElementById('assign-dispatcher-id');
    dSelect.innerHTML = '<option value="">-- Choose Dispatcher --</option>' + 
      dispatchers.map(d => `<option value="${d.id}">${escapeHtml(d.name)} (${escapeHtml(d.email)})</option>`).join('');

    const trucks = (await truckRes.json()).trucks || [];
    const tSelect = document.getElementById('assign-truck-id');
    tSelect.innerHTML = '<option value="">-- Choose Truck --</option>' +
      trucks.map(t => `<option value="${t.id}">Truck #${escapeHtml(t.truck_number)} (${escapeHtml(t.equipment_type || 'Dry Van')})</option>`).join('');

    const drivers = (await driverRes.json()).drivers || [];
    const drSelect = document.getElementById('assign-driver-id');
    drSelect.innerHTML = '<option value="">-- Choose Driver (Optional) --</option>' +
      drivers.map(dr => `<option value="${dr.id}">${escapeHtml(dr.name)} (${escapeHtml(dr.phone)})</option>`).join('');
  } catch (err) {
    console.error('Error loading modal dropdowns:', err);
  }
}

function closeAssignTruckModal() {
  document.getElementById('assign-truck-modal').style.display = 'none';
}

document.getElementById('assign-truck-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    dispatcher_id: document.getElementById('assign-dispatcher-id').value,
    truck_id: document.getElementById('assign-truck-id').value,
    driver_id: document.getElementById('assign-driver-id').value || null,
    shift_type: document.getElementById('assign-shift').value
  };

  try {
    const res = await fetch('/api/employees/assign-truck', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      closeAssignTruckModal();
      await loadAssignmentsTab();
      alert('✅ Truck & driver successfully assigned to dispatcher!');
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to assign truck');
    }
  } catch (err) {
    alert('Error assigning truck');
  }
});

async function unassignTruck(dispatcherId, truckId) {
  if (!confirm('Remove this truck assignment from dispatcher?')) return;
  try {
    const res = await fetch('/api/employees/unassign-truck', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dispatcher_id: dispatcherId, truck_id: truckId })
    });
    if (res.ok) {
      await loadAssignmentsTab();
    }
  } catch (err) {
    alert('Error unassigning truck');
  }
}

// ---- User Management List ----
async function loadUsersList() {
  const tbody = document.querySelector('#admin-users-table tbody');
  if (!tbody) return;
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    const users = data.users || [];

    tbody.innerHTML = users.map(u => `
      <tr>
        <td><b>${escapeHtml(u.name)}</b></td>
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge badge-booked">${escapeHtml(u.role)}</span></td>
        <td>${escapeHtml(u.company_name || '-')}</td>
        <td>${escapeHtml(u.phone || '-')}</td>
        <td><code style="background:rgba(255,255,255,0.05);padding:2px 6px;border-radius:4px;font-size:12px;color:var(--amber-primary);">${escapeHtml(u.signup_ip || 'N/A')}</code></td>
        <td>${u.is_suspended ? '<span class="badge badge-unpaid">Suspended</span>' : '<span class="badge badge-paid">Active</span>'}</td>
        <td>
          <button class="btn btn-outline btn-sm" onclick="toggleUserSuspend(${u.id}, ${!u.is_suspended})">
            ${u.is_suspended ? 'Unsuspend' : 'Suspend'}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8">Error loading users.</td></tr>`;
  }
}

async function toggleUserSuspend(userId, suspend) {
  await fetch(`/api/users/${userId}/suspend`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ suspended: suspend })
  });
  loadUsersList();
}

async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user?')) return;
  const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) alert(data.error || 'Could not delete user.');
  else { loadUsersList(); loadCarriersTab(); populateCarrierFilter(); }
}

async function loadPerformanceTables() {
  try {
    const res = await fetch('/api/dashboard/stats');
    const data = await res.json();

    const dispTbody = document.querySelector('#disp-perf-table tbody');
    if (dispTbody) {
      dispTbody.innerHTML = (data.dispatcherPerformance || []).map(d => `
        <tr><td>${escapeHtml(d.name)}</td><td>${d.load_count}</td><td>${formatCurrency(d.gross_booked)}</td></tr>
      `).join('') || `<tr><td colspan="3">No dispatchers found.</td></tr>`;
    }

    const carTbody = document.querySelector('#carrier-perf-table tbody');
    if (carTbody) {
      carTbody.innerHTML = (data.carrierPerformance || []).map(c => `
        <tr><td>${escapeHtml(c.company_name || c.name)}</td><td>${c.load_count}</td><td>${formatCurrency(c.total_paid)}</td></tr>
      `).join('') || `<tr><td colspan="3">No carriers found.</td></tr>`;
    }
  } catch (err) {
    console.error('Error loading performance tables:', err);
  }
function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openCustomInvoiceModal() {
  const modal = document.getElementById('custom-invoice-modal');
  if (modal) modal.style.display = 'flex';
}

function closeCustomInvoiceModal() {
  const modal = document.getElementById('custom-invoice-modal');
  if (modal) modal.style.display = 'none';
  const resDiv = document.getElementById('cinv-result');
  if (resDiv) resDiv.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  const customInvForm = document.getElementById('custom-invoice-form');
  if (customInvForm) {
    customInvForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const resultDiv = document.getElementById('cinv-result');
      resultDiv.style.display = 'block';
      resultDiv.style.background = '#fef3c7';
      resultDiv.style.borderColor = '#fde047';
      resultDiv.style.color = '#854d0e';
      resultDiv.innerHTML = '⏳ Generating Corporate Invoice (PDF &amp; HTML)...';

      const payload = {
        clientName: document.getElementById('cinv-name').value,
        clientEmail: document.getElementById('cinv-email').value,
        clientPhone: document.getElementById('cinv-phone').value,
        clientAddress: document.getElementById('cinv-address').value,
        description: document.getElementById('cinv-desc').value,
        amount: parseFloat(document.getElementById('cinv-amount').value),
        status: document.getElementById('cinv-status').value,
        dueDate: document.getElementById('cinv-duedate').value,
        memo: document.getElementById('cinv-memo').value
      };

      try {
        const res = await fetch('/api/invoices/create-custom', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) {
          resultDiv.style.background = '#fef2f2';
          resultDiv.style.borderColor = '#fca5a5';
          resultDiv.style.color = '#991b1b';
          resultDiv.innerHTML = '❌ ' + (data.error || 'Invoice generation failed');
        } else {
          resultDiv.style.background = '#ecfdf5';
          resultDiv.style.borderColor = '#a7f3d0';
          resultDiv.style.color = '#065f46';
          resultDiv.innerHTML = `✅ Invoice #${data.invoiceNumber} Generated Successfully!<br style="margin-bottom:6px;">
            <a href="${data.htmlUrl}" target="_blank" style="font-weight:bold;color:#047857;text-decoration:underline;">📄 View / Print HTML Invoice</a> | 
            <a href="${data.pdfUrl}" target="_blank" download style="font-weight:bold;color:#047857;text-decoration:underline;">📥 Download Vector PDF File</a>`;
        }
      } catch (err) {
        resultDiv.style.background = '#fef2f2';
        resultDiv.style.borderColor = '#fca5a5';
        resultDiv.style.color = '#991b1b';
        resultDiv.innerHTML = '❌ Network error creating invoice.';
      }
    });
  }
});

document.addEventListener('DOMContentLoaded', initAdmin);

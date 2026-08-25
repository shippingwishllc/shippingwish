let allLeads = [];
let activeFilter = 'all';
let searchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  await loadCRMStats();
  await loadCRMLeads();
  await loadCRMTasks();
});

async function checkAuth() {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
      window.location.href = '/login';
      return;
    }
    const data = await res.json();
    document.getElementById('user-display-name').textContent = `${data.user.name} (${data.user.role})`;
    if (document.getElementById('sales-avatar-initials')) {
      const initials = data.user.name.split(' ').map(n=>n[0]).join('').toUpperCase();
      document.getElementById('sales-avatar-initials').textContent = initials || 'SR';
    }
  } catch (err) {
    window.location.href = '/login';
  }
}

async function loadCRMStats() {
  try {
    const res = await fetch('/api/crm/leads/stats');
    if (res.ok) {
      const stats = await res.json();
      document.getElementById('stat-total').textContent = stats.total || 0;
      document.getElementById('stat-new').textContent = stats.new || 0;
      document.getElementById('stat-interested').textContent = stats.interested || 0;
      document.getElementById('stat-active').textContent = stats.active || 0;
    }
  } catch (err) {
    console.error('Error loading CRM stats:', err);
  }
}

async function loadCRMLeads() {
  try {
    const res = await fetch('/api/crm/leads');
    if (res.ok) {
      const data = await res.json();
      allLeads = data.leads || [];
      updateCounts();
      renderLeads();
    }
  } catch (err) {
    console.error('Error loading leads:', err);
  }
}

function updateCounts() {
  const cnt = (st) => allLeads.filter(l => l.status === st).length;
  if(document.getElementById('cnt-all')) document.getElementById('cnt-all').textContent = allLeads.length;
  if(document.getElementById('cnt-new')) document.getElementById('cnt-new').textContent = cnt('new');
  if(document.getElementById('cnt-contacted')) document.getElementById('cnt-contacted').textContent = cnt('contacted');
  if(document.getElementById('cnt-interested')) document.getElementById('cnt-interested').textContent = cnt('interested');
  if(document.getElementById('cnt-packet')) document.getElementById('cnt-packet').textContent = cnt('packet_sent');
  if(document.getElementById('cnt-active')) document.getElementById('cnt-active').textContent = cnt('active');
}

function filterLeads(status, btnElement) {
  activeFilter = status;
  document.querySelectorAll('.filter-tab-pill').forEach(el => el.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  renderLeads();
}

function onLeadSearchInput() {
  searchQuery = (document.getElementById('lead-search-input').value || '').toLowerCase().trim();
  renderLeads();
}

function renderLeads() {
  const tbody = document.getElementById('leads-table-body');

  let filtered = activeFilter === 'all'
    ? allLeads
    : allLeads.filter(l => l.status === activeFilter);

  if (searchQuery) {
    filtered = filtered.filter(l =>
      (l.company_name || '').toLowerCase().includes(searchQuery) ||
      (l.owner_name || '').toLowerCase().includes(searchQuery) ||
      (l.phone || '').toLowerCase().includes(searchQuery) ||
      (l.email || '').toLowerCase().includes(searchQuery) ||
      (l.mc_number || '').toLowerCase().includes(searchQuery)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;" class="text-muted">No carrier leads found.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(lead => {
    const ownerName = lead.sales_rep_name || 'Unassigned';
    const ownerPill = lead.sales_rep_name
      ? `<span class="owner-pill"><span class="avatar-micro">${ownerName[0]}</span> ${escapeHtml(ownerName)}</span>`
      : `<span class="owner-pill unassigned" onclick="claimLead(${lead.id})" title="Click to claim this lead" style="cursor:pointer;">✨ Claim Lead</span>`;

    return `
      <tr>
        <td>
          <div style="font-weight:700;color:var(--text-primary);font-size:14px;">${escapeHtml(lead.company_name)}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">👤 ${escapeHtml(lead.owner_name || 'Owner / Mgr')}</div>
        </td>
        <td>
          <div style="font-weight:600;font-size:13px;"><a href="javascript:void(0)" onclick="triggerCall(${lead.id}, '${escapeHtml(lead.phone)}')" style="color:var(--color-amber-600);">📞 ${escapeHtml(lead.phone)}</a></div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">✉️ ${escapeHtml(lead.email || 'No email')}</div>
        </td>
        <td>
          <span class="equip-tag" style="background:#eff6ff;color:#1e40af;border-color:#bfdbfe;">${escapeHtml(lead.mc_number || 'N/A')}</span>
          ${lead.dot_number ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">DOT# ${escapeHtml(lead.dot_number)}</div>` : ''}
        </td>
        <td>
          <span class="equip-tag">${escapeHtml(lead.equipment_type || '53ft Dry Van')}</span>
          <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">🚚 ${lead.num_trucks || 1} Truck(s)</div>
        </td>
        <td>${ownerPill}</td>
        <td>
          <select class="form-select" onchange="updateLeadStatus(${lead.id}, this.value)" style="padding:3px 22px 3px 8px;font-size:11px;font-weight:700;border-radius:12px;height:auto;">
            <option value="new" ${lead.status === 'new' ? 'selected' : ''}>🔵 New</option>
            <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>🟡 Contacted</option>
            <option value="interested" ${lead.status === 'interested' ? 'selected' : ''}>🟢 Interested</option>
            <option value="packet_sent" ${lead.status === 'packet_sent' ? 'selected' : ''}>🟣 Packet Sent</option>
            <option value="active" ${lead.status === 'active' ? 'selected' : ''}>⭐ Active Client</option>
            <option value="dead" ${lead.status === 'dead' ? 'selected' : ''}>⚪ Unqualified</option>
          </select>
        </td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:nowrap;">
            <button class="btn-table-action call" title="Call via VOIP" onclick="triggerCall(${lead.id}, '${escapeHtml(lead.phone)}')">📞 Call</button>
            <button class="btn-table-action sms" title="SMS Pitch" onclick="sendSmsModal(${lead.id}, '${escapeHtml(lead.phone)}')">💬 SMS</button>
            <button class="btn-table-action email" title="Send Email Packet" onclick="sendOutreachEmail(${lead.id}, '${escapeHtml(lead.email)}', '${escapeHtml(lead.owner_name)}', '${escapeHtml(lead.company_name)}', 'onboarding_packet')">✉️ Packet</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Claim an unassigned lead
async function claimLead(leadId) {
  try {
    const res = await fetch(`/api/crm/leads/${leadId}/claim`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      alert(`✨ ${data.message}`);
      await loadCRMLeads();
    } else {
      alert(data.message || data.error || 'Could not claim lead');
    }
  } catch (err) {
    alert('Error claiming lead');
  }
}

// FMCSA Live Sourcing Engine
async function searchFMCSA() {
  const query = (document.getElementById('fmcsa-query-input').value || '').trim();
  if (!query) {
    alert('Please enter an MC#, DOT#, or Company Name to search US government carriers database.');
    return;
  }

  const btn = document.getElementById('btn-fmcsa-search');
  btn.disabled = true;
  btn.textContent = '⏳ Searching FMCSA...';

  try {
    let url = '/api/crm/fmcsa/search?';
    if (/^\d+$/.test(query.replace(/MC-?/i, ''))) {
      url += `mc=${encodeURIComponent(query.replace(/MC-?/i, ''))}`;
    } else {
      url += `name=${encodeURIComponent(query)}`;
    }

    const res = await fetch(url);
    const data = await res.json();
    btn.disabled = false;
    btn.textContent = '🔎 Search US Carriers';

    const resultsDiv  = document.getElementById('fmcsa-results-container');
    const resultsList = document.getElementById('fmcsa-results-list');
    const resultsTitle= document.getElementById('fmcsa-results-title');

    resultsDiv.style.display = 'block';
    resultsTitle.textContent = `FMCSA Government Results (${(data.carriers||[]).length} Found) — Source: ${data.source}`;

    if (!data.carriers || data.carriers.length === 0) {
      resultsList.innerHTML = `<p style="color:#94a3b8;font-size:12px;grid-column:1/-1;">No carriers found matching "${query}". Check MC# or name and try again.</p>`;
      return;
    }

    resultsList.innerHTML = data.carriers.map(c => `
      <div style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:12px;display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <div style="font-weight:800;color:#fff;font-size:13px;">${escapeHtml(c.company_name)}</div>
          <div style="font-size:11px;color:#f59e0b;margin-top:2px;">MC: ${c.mc_number || 'N/A'} | DOT: ${c.dot_number || 'N/A'}</div>
          <div style="font-size:11px;color:#cbd5e1;margin-top:4px;">📍 ${escapeHtml(c.address || c.state || 'USA')}</div>
          <div style="font-size:11px;color:#cbd5e1;">📞 ${escapeHtml(c.phone || 'N/A')}</div>
        </div>

        <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">
          ${c.already_in_crm
            ? `<span style="font-size:10px;color:#f59e0b;font-weight:700;">🔒 In CRM (${escapeHtml(c.owned_by)})</span>`
            : `<button class="btn btn-primary btn-xs w-full" onclick='importFMCSACarrier(${JSON.stringify(c).replace(/'/g, "&apos;")})'>➕ 1-Click Import Lead</button>`
          }
        </div>
      </div>
    `).join('');
  } catch (err) {
    btn.disabled = false;
    btn.textContent = '🔎 Search US Carriers';
    alert('Failed to search FMCSA database.');
  }
}

function closeFMCSAResults() {
  document.getElementById('fmcsa-results-container').style.display = 'none';
}

async function importFMCSACarrier(c) {
  try {
    const res = await fetch('/api/crm/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name:   c.company_name,
        owner_name:     c.owner_name || '',
        phone:          c.phone || '+19177370021',
        email:          c.email || '',
        mc_number:      c.mc_number || '',
        dot_number:     c.dot_number || '',
        equipment_type: c.equipment_type || '53ft Dry Van',
        num_trucks:     c.num_trucks || 1,
        notes:          `Imported from FMCSA government API. State: ${c.state||'USA'}`
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ Carrier "${c.company_name}" imported into CRM!`);
      await loadCRMLeads();
      await loadCRMStats();
      await loadCRMTasks();
      searchFMCSA(); // refresh results
    } else if (res.status === 409) {
      alert(`⚠️ ${data.message}`);
    } else {
      alert(data.error || 'Import failed');
    }
  } catch (err) {
    alert('Error importing FMCSA carrier');
  }
}

// Trigger SMS modal
function sendSmsModal(leadId, phone) {
  const msg = prompt(`Enter SMS pitch to send to ${phone}:`, `Hi from Shipping Wish LLC! We have premium high-paying US freight lanes available for your trucks. Reply back or call us at +1 (917) 737-0021.`);
  if (!msg) return;

  fetch('/api/voip/send-sms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_id: leadId, to_number: phone, message: msg })
  })
  .then(r => r.json())
  .then(data => alert(`💬 ${data.message}`))
  .catch(() => alert('SMS request failed.'));
}

async function triggerCall(leadId, phone) {
  if (!phone || phone === 'No phone') {
    alert('No phone number available for this lead.');
    return;
  }
  try {
    const res = await fetch('/api/voip/click-to-call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lead_id: leadId, to_number: phone })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`📞 Call Initiated! Opening ${data.call_url || 'VOIP App'}`);
      if (data.call_url) window.location.href = data.call_url;
      await loadCRMLeads();
    } else {
      alert(data.error || 'Failed to initiate call');
    }
  } catch (err) {
    alert('Error initiating VOIP call');
  }
}

async function sendOutreachEmail(leadId, email, ownerName, compName, emailType) {
  if (!email || email === 'No email') {
    alert('Please enter an email address for this lead first.');
    return;
  }

  const confirmMsg = emailType === 'onboarding_packet'
    ? `Send Official Welcome Packet Email via Resend to ${email}?`
    : `Send Branded Cold Outreach Email via Resend to ${email}?`;

  if (!confirm(confirmMsg)) return;

  try {
    const res = await fetch('/api/email/send-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: leadId,
        recipient_email: email,
        owner_name: ownerName,
        company_name: compName,
        email_type: emailType
      })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message}`);
      await loadCRMLeads();
      await loadCRMStats();
    } else {
      alert(data.error || 'Failed to send email');
    }
  } catch (err) {
    alert('Error sending email via Resend');
  }
}

async function updateLeadStatus(leadId, newStatus) {
  try {
    const res = await fetch(`/api/crm/leads/${leadId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus })
    });
    if (res.ok) {
      await loadCRMLeads();
      await loadCRMStats();
    }
  } catch (err) {
    console.error('Error updating status:', err);
  }
}

async function loadCRMTasks() {
  try {
    const res = await fetch('/api/crm/tasks');
    if (res.ok) {
      const data = await res.json();
      const container = document.getElementById('tasks-list-container');
      const tasks = data.tasks || [];

      if (tasks.length === 0) {
        container.innerHTML = '<p class="muted" style="font-size:13px;text-align:center;padding:20px;">No pending tasks for today!</p>';
        return;
      }

      container.innerHTML = tasks.map(t => `
        <div class="task-item">
          <div style="display:flex;align-items:center;gap:10px;">
            <input type="checkbox" ${t.is_completed ? 'checked' : ''} onchange="toggleTask(${t.id})">
            <span class="${t.is_completed ? 'task-completed' : ''}">
              <b>${escapeHtml(t.company_name)}</b><br>
              <span class="muted" style="font-size:11px;">${escapeHtml(t.task_title)}</span>
            </span>
          </div>
          <span class="badge ${t.is_completed ? 'badge-paid' : 'badge-booked'}" style="font-size:10px;">
            ${t.is_completed ? 'Done' : 'Due Today'}
          </span>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error loading tasks:', err);
  }
}

async function toggleTask(taskId) {
  try {
    await fetch(`/api/crm/tasks/${taskId}/toggle`, { method: 'PUT' });
    await loadCRMTasks();
  } catch (err) {
    console.error('Error toggling task:', err);
  }
}

function openAddLeadModal() {
  document.getElementById('add-lead-modal').style.display = 'flex';
}

function closeAddLeadModal() {
  document.getElementById('add-lead-modal').style.display = 'none';
}

document.getElementById('add-lead-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    company_name: document.getElementById('new-comp-name').value,
    owner_name: document.getElementById('new-owner-name').value,
    phone: document.getElementById('new-phone').value,
    email: document.getElementById('new-email').value,
    mc_number: document.getElementById('new-mc').value,
    equipment_type: document.getElementById('new-equipment').value,
    notes: document.getElementById('new-notes').value
  };

  try {
    const res = await fetch('/api/crm/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      closeAddLeadModal();
      e.target.reset();
      await loadCRMLeads();
      await loadCRMStats();
      await loadCRMTasks();
      alert('✅ Carrier lead & automated follow-up task added successfully!');
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to add lead');
    }
  } catch (err) {
    alert('Error adding carrier lead');
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
    window.location.href = '/login';
  });
}

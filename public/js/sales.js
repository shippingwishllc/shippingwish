let allLeads = [];
let activeFilter = 'all';

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
      window.location.href = '/login.html';
      return;
    }
    const data = await res.json();
    document.getElementById('user-display-name').textContent = `${data.user.name} (${data.user.role})`;
  } catch (err) {
    window.location.href = '/login.html';
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
      renderLeads();
    }
  } catch (err) {
    console.error('Error loading leads:', err);
  }
}

function filterLeads(status, btnElement) {
  activeFilter = status;
  document.querySelectorAll('.filter-pill').forEach(el => el.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  renderLeads();
}

function renderLeads() {
  const tbody = document.getElementById('leads-table-body');
  const filtered = activeFilter === 'all' 
    ? allLeads 
    : allLeads.filter(l => l.status === activeFilter);

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;" class="muted">No carrier leads found for stage "${activeFilter}".</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(lead => {
    const badgeClass = 
      lead.status === 'active' ? 'badge-paid' :
      lead.status === 'interested' || lead.status === 'packet_sent' ? 'badge-booked' : 'badge-new';

    return `
      <tr>
        <td>
          <b style="color:#fff;font-size:15px;">${escapeHtml(lead.company_name)}</b><br>
          <span class="muted" style="font-size:12px;">👤 ${escapeHtml(lead.owner_name || 'Owner')}</span>
        </td>
        <td>
          <a href="javascript:void(0)" onclick="triggerCall(${lead.id}, '${escapeHtml(lead.phone)}')" style="color:var(--amber-primary);font-weight:700;">📞 ${escapeHtml(lead.phone)}</a><br>
          <span class="muted" style="font-size:12px;">✉️ ${escapeHtml(lead.email || 'No email')}</span>
        </td>
        <td>
          <span class="badge badge-booked">${escapeHtml(lead.mc_number || 'No MC')}</span>
        </td>
        <td>
          <span style="font-size:13px;">${escapeHtml(lead.equipment_type)}</span>
        </td>
        <td>
          <select onchange="updateLeadStatus(${lead.id}, this.value)" style="background:var(--bg-main);color:#fff;border:1px solid var(--border-glow);padding:4px 8px;border-radius:4px;font-size:12px;">
            <option value="new" ${lead.status === 'new' ? 'selected' : ''}>New</option>
            <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>Contacted</option>
            <option value="interested" ${lead.status === 'interested' ? 'selected' : ''}>Interested</option>
            <option value="packet_sent" ${lead.status === 'packet_sent' ? 'selected' : ''}>Packet Sent</option>
            <option value="active" ${lead.status === 'active' ? 'selected' : ''}>Active Carrier</option>
            <option value="dead" ${lead.status === 'dead' ? 'selected' : ''}>Dead / Unqualified</option>
          </select>
        </td>
        <td>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-amber btn-sm" title="Click-to-Call OpenPhone" onclick="triggerCall(${lead.id}, '${escapeHtml(lead.phone)}')">📞 Call</button>
            <button class="btn btn-blue btn-sm" title="Send 1-Click Email" onclick="sendOutreachEmail(${lead.id}, '${escapeHtml(lead.email)}', '${escapeHtml(lead.owner_name)}', '${escapeHtml(lead.company_name)}', 'outreach')">✉️ Email</button>
            <button class="btn btn-outline btn-sm" title="Send Onboarding Packet" onclick="sendOutreachEmail(${lead.id}, '${escapeHtml(lead.email)}', '${escapeHtml(lead.owner_name)}', '${escapeHtml(lead.company_name)}', 'onboarding_packet')">📑 Packet</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
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
    window.location.href = '/login.html';
  });
}

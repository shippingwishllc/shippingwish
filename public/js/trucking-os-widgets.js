// public/js/trucking-os-widgets.js
// Unified USA Trucking OS Command Bar for Shipping Wish Dispatcher & Carrier Dashboards
// Connects live to:
//   - GET  /api/loads/profit-analyze            (True Net-Profit Load Calculator)
//   - POST /api/dispatch-desk/loads/:id/request-approval (Dispatcher 1-Tap Approval Sender)
//   - POST /api/loads/:id/carrier-decision      (Carrier 1-Tap Zero-Forced-Dispatch Approve/Pass)
//   - POST /api/settlements/factoring-packet    (1-Click Broker / Factoring Billing Packet PDF & Email)
//   - POST /api/settlements/generate            (Driver Pay Settlements & PDF)
//   - GET  /api/settlements/truck-pnl           (Per-Truck Profit & Loss Analytics)

(function () {
  if (window.__swTruckingOsLoaded) return;
  window.__swTruckingOsLoaded = true;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function apiJson(url, opts = {}) {
    const res = await fetch(url, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      ...opts
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function injectStyles() {
    if (document.getElementById('sw-os-styles')) return;
    const st = document.createElement('style');
    st.id = 'sw-os-styles';
    st.textContent = `
      .sw-os-bar {
        background: linear-gradient(135deg, #0b1528 0%, #162747 100%);
        color: #f8fafc;
        border: 1px solid #1e3a5f;
        border-radius: 14px;
        padding: 14px 18px;
        margin: 14px 0 18px;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        box-shadow: 0 10px 28px rgba(11, 21, 40, 0.14);
      }
      .sw-os-title { font-weight: 800; font-size: 14px; letter-spacing: .3px; display: flex; align-items: center; gap: 8px; }
      .sw-os-pill { background: rgba(16, 185, 129, 0.18); color: #34d399; border: 1px solid rgba(52, 211, 153, 0.35); font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 999px; text-transform: uppercase; }
      .sw-os-actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .sw-os-btn {
        background: #2563eb; color: #fff; border: none; border-radius: 8px; padding: 8px 13px;
        font-size: 12px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
        transition: transform .12s, background .15s;
      }
      .sw-os-btn:hover { background: #1d4ed8; transform: translateY(-1px); }
      .sw-os-btn.amber { background: #d97706; }
      .sw-os-btn.amber:hover { background: #b45309; }
      .sw-os-btn.emerald { background: #059669; }
      .sw-os-btn.emerald:hover { background: #047857; }
      .sw-os-btn.ghost { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); }
      .sw-os-btn.ghost:hover { background: rgba(255,255,255,0.18); }

      .sw-os-backdrop {
        position: fixed; inset: 0; background: rgba(11, 21, 40, 0.65); z-index: 99990;
        display: none; align-items: center; justify-content: center; padding: 16px;
      }
      .sw-os-backdrop.open { display: flex; }
      .sw-os-modal {
        background: #ffffff; color: #0f172a; border-radius: 16px; width: 100%; max-width: 720px;
        max-height: 90vh; overflow-y: auto; box-shadow: 0 24px 70px rgba(11, 21, 40, 0.35);
      }
      .sw-os-modal-head {
        background: #0b1528; color: #fff; padding: 16px 22px; display: flex; justify-content: space-between; align-items: center;
      }
      .sw-os-modal-head h3 { margin: 0; font-size: 16px; font-weight: 800; }
      .sw-os-close { background: rgba(255,255,255,0.14); color: #fff; border: none; border-radius: 8px; width: 32px; height: 32px; cursor: pointer; font-weight: 800; }
      .sw-os-modal-body { padding: 20px 22px; }
      .sw-os-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 14px; }
      .sw-os-field label { display: block; font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 4px; text-transform: uppercase; }
      .sw-os-field input, .sw-os-field select {
        width: 100%; padding: 9px 11px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 13px; color: #0f172a; background: #fff;
      }
      .sw-os-result { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-top: 14px; }
      .sw-os-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; }
      .sw-os-kpi { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; }
      .sw-os-kpi .k { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; }
      .sw-os-kpi .v { font-size: 17px; font-weight: 800; color: #0f172a; margin-top: 3px; }
      .sw-os-approval-banner {
        background: #fffbeb; border: 2px solid #f59e0b; border-radius: 12px; padding: 14px 16px; margin: 12px 0;
      }
    `;
    document.head.appendChild(st);
  }

  function ensureModal() {
    let bd = document.getElementById('sw-os-backdrop');
    if (bd) return bd;
    bd = document.createElement('div');
    bd.id = 'sw-os-backdrop';
    bd.className = 'sw-os-backdrop';
    bd.innerHTML = `
      <div class="sw-os-modal" role="dialog" aria-modal="true">
        <div class="sw-os-modal-head">
          <h3 id="sw-os-modal-title">USA Trucking OS</h3>
          <button class="sw-os-close" id="sw-os-close">✕</button>
        </div>
        <div class="sw-os-modal-body" id="sw-os-modal-body"></div>
      </div>`;
    bd.addEventListener('click', (e) => { if (e.target === bd) bd.classList.remove('open'); });
    document.body.appendChild(bd);
    document.getElementById('sw-os-close').onclick = () => bd.classList.remove('open');
    return bd;
  }

  function openModal(title, html) {
    const bd = ensureModal();
    document.getElementById('sw-os-modal-title').textContent = title;
    document.getElementById('sw-os-modal-body').innerHTML = html;
    bd.classList.add('open');
  }

  // 1. True Net-Profit Load Calculator Modal
  function openProfitModal() {
    openModal('💰 True Net-Profit Load Calculator (AI Profit Engine)', `
      <div class="sw-os-grid">
        <div class="sw-os-field"><label>Gross Rate ($)</label><input id="swp-rate" type="number" value="3200"></div>
        <div class="sw-os-field"><label>Loaded Miles</label><input id="swp-miles" type="number" value="780"></div>
        <div class="sw-os-field"><label>Deadhead Miles</label><input id="swp-dh" type="number" value="45"></div>
        <div class="sw-os-field"><label>Origin (City, ST)</label><input id="swp-orig" value="Dallas, TX"></div>
        <div class="sw-os-field"><label>Destination (City, ST)</label><input id="swp-dest" value="Atlanta, GA"></div>
        <div class="sw-os-field"><label>Equipment</label>
          <select id="swp-eq"><option>53ft Dry Van</option><option>53ft Reefer</option><option>48ft Flatbed</option><option>40ft Hotshot</option><option>26ft Box Truck</option></select>
        </div>
      </div>
      <button class="sw-os-btn" id="swp-run">⚡ Calculate True Net Profit</button>
      <div id="swp-out" class="sw-os-result" style="display:none"></div>
    `);
    document.getElementById('swp-run').onclick = async () => {
      const out = document.getElementById('swp-out');
      out.style.display = 'block';
      out.innerHTML = 'Calculating real regional diesel, deadhead, tolls & net margin...';
      try {
        const qs = new URLSearchParams({
          rate: document.getElementById('swp-rate').value,
          miles: document.getElementById('swp-miles').value,
          deadhead: document.getElementById('swp-dh').value,
          origin: document.getElementById('swp-orig').value,
          destination: document.getElementById('swp-dest').value,
          equipment: document.getElementById('swp-eq').value
        }).toString();
        const { analysis: a } = await apiJson(`/api/loads/profit-analyze?${qs}`);
        out.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <strong style="font-size:15px;color:${esc(a.verdict_color)}">${esc(a.verdict_label)}</strong>
            <span style="font-size:12px;color:#475569">Diesel Avg: $${a.diesel_price}/gal • ${a.truck_mpg} MPG</span>
          </div>
          <div class="sw-os-kpi-grid">
            <div class="sw-os-kpi"><div class="k">True Net Profit</div><div class="v" style="color:#059669">$${Number(a.true_net_profit).toLocaleString()}</div></div>
            <div class="sw-os-kpi"><div class="k">Effective RPM (All Mi)</div><div class="v">$${a.effective_rpm}/mi</div></div>
            <div class="sw-os-kpi"><div class="k">Est. Fuel Cost</div><div class="v" style="color:#b45309">-$${a.fuel_cost}</div></div>
            <div class="sw-os-kpi"><div class="k">Tolls + Factoring</div><div class="v">-$${(a.tolls_est + a.factoring_fee).toFixed(0)}</div></div>
            <div class="sw-os-kpi"><div class="k">Net Margin</div><div class="v">${a.margin_percent}%</div></div>
            <div class="sw-os-kpi"><div class="k">Target Counter</div><div class="v" style="color:#2563eb">$${Number(a.suggested_counter_rate).toLocaleString()}</div></div>
          </div>`;
      } catch (e) {
        out.innerHTML = `<span style="color:#dc2626">${esc(e.message)}</span>`;
      }
    };
  }

  // 2. 1-Click Factoring / Broker Billing Packet Modal
  async function openFactoringPacketModal() {
    openModal('💸 1-Click Broker / Factoring Billing Packet', `<div id="swfp-wrap">Loading eligible loads...</div>`);
    const wrap = document.getElementById('swfp-wrap');
    try {
      const data = await apiJson('/api/loads');
      const loads = (data.loads || []).slice(0, 40);
      if (!loads.length) {
        wrap.innerHTML = '<p>No loads found yet. Book or deliver a load first.</p>';
        return;
      }
      wrap.innerHTML = `
        <div class="sw-os-grid">
          <div class="sw-os-field"><label>Select Load</label>
            <select id="swfp-load">${loads.map(l => `<option value="${l.id}">${esc(l.load_number)} — ${esc(l.pickup_location)} → ${esc(l.delivery_location)} ($${Number(l.rate||0).toLocaleString()})</option>`).join('')}</select>
          </div>
          <div class="sw-os-field"><label>Send Packet To</label>
            <select id="swfp-type"><option value="factoring">Factoring Company (NOA)</option><option value="broker">Direct Broker Accounts Payable</option></select>
          </div>
          <div class="sw-os-field"><label>Recipient Name</label><input id="swfp-name" placeholder="e.g. RTS Financial / TriumphPay / Broker AP"></div>
          <div class="sw-os-field"><label>Recipient Email</label><input id="swfp-email" type="email" placeholder="billing@factoring.com"></div>
          <div class="sw-os-field"><label>Approved Detention ($)</label><input id="swfp-det" type="number" value="0"></div>
          <div class="sw-os-field"><label>Lumper / Accessorial ($)</label><input id="swfp-lump" type="number" value="0"></div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button class="sw-os-btn emerald" id="swfp-send">🚀 Generate & Send Packet</button>
          <button class="sw-os-btn" id="swfp-preview">📄 Preview PDF Only</button>
        </div>
        <div id="swfp-msg" class="sw-os-result" style="display:none"></div>
      `;
      document.getElementById('swfp-preview').onclick = () => {
        const lid = document.getElementById('swfp-load').value;
        window.open(`/api/settlements/factoring-packet/${encodeURIComponent(lid)}/pdf`, '_blank');
      };
      document.getElementById('swfp-send').onclick = async () => {
        const msg = document.getElementById('swfp-msg');
        msg.style.display = 'block';
        msg.textContent = 'Generating branded Billing Packet & emailing recipient...';
        try {
          const r = await apiJson('/api/settlements/factoring-packet', {
            method: 'POST',
            body: JSON.stringify({
              loadId: Number(document.getElementById('swfp-load').value),
              recipientType: document.getElementById('swfp-type').value,
              recipientName: document.getElementById('swfp-name').value,
              recipientEmail: document.getElementById('swfp-email').value,
              detentionAmount: Number(document.getElementById('swfp-det').value || 0),
              lumperAmount: Number(document.getElementById('swfp-lump').value || 0)
            })
          });
          msg.innerHTML = `<strong style="color:#059669">✅ ${esc(r.message)}</strong><div style="margin-top:8px"><a class="sw-os-btn" target="_blank" href="${esc(r.pdf_url)}">📥 Download Packet PDF</a></div>`;
        } catch (e) {
          msg.innerHTML = `<span style="color:#dc2626">${esc(e.message)}</span>`;
        }
      };
    } catch (e) {
      wrap.innerHTML = `<span style="color:#dc2626">${esc(e.message)}</span>`;
    }
  }

  // 3. Driver Settlements & Per-Truck P&L Modal
  async function openSettlementsModal() {
    openModal('📊 Driver Settlements & Per-Truck P&L', `<div id="swst-wrap">Loading Per-Truck P&L & Settlements...</div>`);
    const wrap = document.getElementById('swst-wrap');
    try {
      const [pnl, stl] = await Promise.all([
        apiJson('/api/settlements/truck-pnl?days=30'),
        apiJson('/api/settlements')
      ]);
      const trucks = pnl.trucks || [];
      const rows = stl.settlements || [];
      wrap.innerHTML = `
        <h4 style="margin:0 0 8px;font-size:13px;color:#0b1528;">30-Day Per-Truck Profit &amp; Loss (P&amp;L)</h4>
        ${trucks.length ? `<div class="sw-os-kpi-grid" style="margin-bottom:16px;">${trucks.map(t => `
          <div class="sw-os-kpi">
            <div class="k">Unit ${esc(t.truck_unit)} (${t.loads_count} loads)</div>
            <div class="v" style="color:#059669">$${Number(t.net_profit).toLocaleString()}</div>
            <div style="font-size:11px;color:#64748b">Gross $${Number(t.gross_revenue).toLocaleString()} • $${t.effective_rpm}/mi</div>
          </div>`).join('')}</div>` : '<p style="font-size:12px;color:#64748b;margin-bottom:14px;">No delivered loads in the last 30 days yet.</p>'}
        <h4 style="margin:12px 0 8px;font-size:13px;color:#0b1528;">Generate Weekly Driver Pay Settlement</h4>
        <div class="sw-os-grid">
          <div class="sw-os-field"><label>Driver Name</label><input id="swst-driver" placeholder="Driver Full Name"></div>
          <div class="sw-os-field"><label>Pay Type</label><select id="swst-type"><option value="percent">% of Gross</option><option value="per_mile">Per Mile ($)</option><option value="flat">Flat Pay ($)</option></select></div>
          <div class="sw-os-field"><label>Pay Rate (% or $)</label><input id="swst-rate" type="number" value="28"></div>
          <div class="sw-os-field"><label>Fuel / Advances ($)</label><input id="swst-ded" type="number" value="0"></div>
        </div>
        <button class="sw-os-btn emerald" id="swst-gen">⚡ Generate Settlement PDF</button>
        <div id="swst-out" style="margin-top:10px;"></div>
        <h4 style="margin:16px 0 8px;font-size:13px;color:#0b1528;">Recent Settlements (${rows.length})</h4>
        ${rows.slice(0, 8).map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:6px;font-size:12px;">
            <div><strong>${esc(s.settlement_number)}</strong> • ${esc(s.driver_name)} (${esc(String(s.period_start).slice(0,10))} → ${esc(String(s.period_end).slice(0,10))})</div>
            <div style="display:flex;align-items:center;gap:10px;">
              <strong style="color:#059669">$${Number(s.net_driver_pay).toLocaleString()}</strong>
              <a class="sw-os-btn" style="padding:4px 10px;font-size:11px;" target="_blank" href="/api/settlements/${s.id}/pdf">PDF</a>
            </div>
          </div>`).join('')}
      `;
      document.getElementById('swst-gen').onclick = async () => {
        const out = document.getElementById('swst-out');
        out.textContent = 'Generating settlement statement...';
        try {
          const r = await apiJson('/api/settlements/generate', {
            method: 'POST',
            body: JSON.stringify({
              driverName: document.getElementById('swst-driver').value,
              payType: document.getElementById('swst-type').value,
              payRate: Number(document.getElementById('swst-rate').value || 28),
              advancesDeduction: Number(document.getElementById('swst-ded').value || 0)
            })
          });
          out.innerHTML = `<strong style="color:#059669">✅ Settlement ${esc(r.settlement.settlement_number)} Created! Net Pay: $${Number(r.settlement.net_driver_pay).toLocaleString()}</strong> <a class="sw-os-btn" style="margin-left:8px;padding:5px 10px;" target="_blank" href="${esc(r.pdf_url)}">📥 Open PDF</a>`;
        } catch (e) {
          out.innerHTML = `<span style="color:#dc2626">${esc(e.message)}</span>`;
        }
      };
    } catch (e) {
      wrap.innerHTML = `<span style="color:#dc2626">${esc(e.message)}</span>`;
    }
  }

  // 4. Dispatcher: 1-Click Send Load for Carrier Approval ("Zero Forced Dispatch")
  async function openSendApprovalModal() {
    openModal('📲 Send 1-Tap Carrier Load Approval (Zero Forced Dispatch)', `<div id="swsa-wrap">Loading loads &amp; carriers...</div>`);
    const wrap = document.getElementById('swsa-wrap');
    try {
      const [loadsData, carriersData] = await Promise.all([
        apiJson('/api/loads'),
        apiJson('/api/carriers').catch(() => ({ carriers: [] }))
      ]);
      const loads = (loadsData.loads || []).slice(0, 40);
      const carriers = carriersData.carriers || carriersData.users || [];
      if (!loads.length) {
        wrap.innerHTML = '<p>No loads available yet. Create or book a load first.</p>';
        return;
      }
      wrap.innerHTML = `
        <div class="sw-os-grid">
          <div class="sw-os-field"><label>Select Load</label>
            <select id="swsa-load">${loads.map(l => `<option value="${l.id}" data-cid="${l.carrier_id || ''}">${esc(l.load_number)} — ${esc(l.pickup_location)} → ${esc(l.delivery_location)} ($${Number(l.rate||0).toLocaleString()})</option>`).join('')}</select>
          </div>
          <div class="sw-os-field"><label>Carrier Account</label>
            <select id="swsa-carrier">
              <option value="">Use Load's Assigned Carrier</option>
              ${carriers.map(c => `<option value="${c.id}">${esc(c.company_name || c.name)} (${esc(c.mc_number || c.email || '')})</option>`).join('')}
            </select>
          </div>
          <div class="sw-os-field"><label>Estimated Deadhead Miles</label><input id="swsa-dh" type="number" value="35"></div>
        </div>
        <button class="sw-os-btn emerald" id="swsa-send">🚀 Send 1-Tap Approval (Push + SMS + Portal)</button>
        <div id="swsa-out" class="sw-os-result" style="display:none"></div>
      `;
      document.getElementById('swsa-send').onclick = async () => {
        const out = document.getElementById('swsa-out');
        out.style.display = 'block';
        out.textContent = 'Calculating Net Profit & transmitting approval offer to carrier...';
        try {
          const sel = document.getElementById('swsa-load');
          const lid = sel.value;
          const cid = document.getElementById('swsa-carrier').value || sel.options[sel.selectedIndex].getAttribute('data-cid');
          const r = await apiJson(`/api/dispatch-desk/loads/${encodeURIComponent(lid)}/request-approval`, {
            method: 'POST',
            body: JSON.stringify({
              carrierId: cid ? Number(cid) : undefined,
              deadheadMiles: Number(document.getElementById('swsa-dh').value || 0)
            })
          });
          out.innerHTML = `<strong style="color:#059669">✅ ${esc(r.message)}</strong><div style="font-size:12px;color:#334155;margin-top:6px;">Est. True Net Profit sent to carrier: <strong>$${Number(r.profit?.true_net_profit || 0).toLocaleString()}</strong> (${esc(r.profit?.verdict_label || '')})</div>`;
        } catch (e) {
          out.innerHTML = `<span style="color:#dc2626">${esc(e.message)}</span>`;
        }
      };
    } catch (e) {
      wrap.innerHTML = `<span style="color:#dc2626">${esc(e.message)}</span>`;
    }
  }

  // 5. AI Pre-Delivery Reload Planner ("Zero Empty Miles")
  async function openReloadFinderModal() {
    openModal('⚡ AI Pre-Delivery Reload Planner ("Zero Empty Miles")', `<div id="swrl-wrap">Loading active loads...</div>`);
    const wrap = document.getElementById('swrl-wrap');
    try {
      const data = await apiJson('/api/loads');
      const loads = (data.loads || []).slice(0, 30);
      if (!loads.length) {
        wrap.innerHTML = '<p>No loads found to match reloads against.</p>';
        return;
      }
      wrap.innerHTML = `
        <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px;">
          <div class="sw-os-field" style="flex:1;min-width:240px;"><label>Active / Delivering Load</label>
            <select id="swrl-load">${loads.map(l => `<option value="${l.id}">${esc(l.load_number)} — Delivering to ${esc(l.delivery_location)} (${esc(l.equipment_type || '53ft')})</option>`).join('')}</select>
          </div>
          <button class="sw-os-btn" id="swrl-run">🔍 Find Highest Net-Profit Reloads</button>
        </div>
        <div id="swrl-out" class="sw-os-result" style="display:none"></div>
      `;
      document.getElementById('swrl-run').onclick = async () => {
        const out = document.getElementById('swrl-out');
        out.style.display = 'block';
        out.textContent = 'Scanning open marketplace loads near delivery ZIP & ranking by True Net Profit/Mile...';
        try {
          const lid = document.getElementById('swrl-load').value;
          const r = await apiJson(`/api/dispatch-desk/reload-suggestions/${encodeURIComponent(lid)}`);
          const list = r.suggestions || [];
          if (!list.length) {
            out.innerHTML = `<p style="margin:0;color:#475569;">No open marketplace reloads within 150 mi of <strong>${esc(r.active_load?.delivery_location)}</strong> right now. Post or sync fresh Loads Nexus freight to populate instant matches.</p>`;
            return;
          }
          out.innerHTML = list.map(s => `
            <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
              <div>
                <strong style="color:#0f172a">${esc(s.pickup_location)} → ${esc(s.delivery_location)}</strong>
                <div style="font-size:11px;color:#475569;">${esc(s.equipment_type)} • ${Number(s.miles||0)} mi • Deadhead: <strong>${s.deadhead_from_delivery} mi</strong> • ${esc(s.posted_age)}</div>
              </div>
              <div style="text-align:right;">
                <strong style="color:#059669;font-size:14px;">$${Number(s.rate||0).toLocaleString()}</strong>
                <div style="font-size:11px;font-weight:700;color:#1d4ed8;">Net ~$${Math.round(s.profit_analysis?.true_net_profit||0).toLocaleString()} • ${esc(s.profit_analysis?.verdict_label||'')}</div>
              </div>
            </div>`).join('');
        } catch (e) {
          out.innerHTML = `<span style="color:#dc2626">${esc(e.message)}</span>`;
        }
      };
    } catch (e) {
      wrap.innerHTML = `<span style="color:#dc2626">${esc(e.message)}</span>`;
    }
  }

  // 6. Check Pending 1-Tap Carrier Load Approvals ("Zero Forced Dispatch")
  async function renderPendingCarrierApprovals(anchor) {
    try {
      const data = await apiJson('/api/loads?status=pending_carrier_approval');
      const pending = (data.loads || []).filter(l => l.status === 'pending_carrier_approval');
      if (!pending.length) return;
      const box = document.createElement('div');
      box.className = 'sw-os-approval-banner';
      box.innerHTML = `
        <div style="font-weight:800;font-size:14px;color:#92400e;margin-bottom:8px;">
          🔔 ${pending.length} Load Offer(s) Awaiting Your 1-Tap Approval (Zero Forced Dispatch)
        </div>
        ${pending.map(l => `
          <div id="sw-appr-${l.id}" style="background:#fff;border:1px solid #fde68a;border-radius:10px;padding:12px;margin-bottom:8px;display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;">
            <div>
              <strong style="color:#0f172a">${esc(l.load_number)}: ${esc(l.pickup_location)} → ${esc(l.delivery_location)}</strong>
              <div style="font-size:12px;color:#475569;margin-top:3px;">Gross: <strong>$${Number(l.rate||0).toLocaleString()}</strong> • ${Number(l.miles||0)} mi • Est. Net Profit: <strong style="color:#059669">$${Number(l.net_profit_est||0).toLocaleString()}</strong></div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="sw-os-btn emerald" data-decide="approve" data-id="${l.id}">✅ Approve &amp; Book</button>
              <button class="sw-os-btn ghost" style="color:#b91c1c;border-color:#fca5a5;background:#fef2f2;" data-decide="decline" data-id="${l.id}">✕ Pass</button>
            </div>
          </div>`).join('')}
      `;
      anchor.insertAdjacentElement('afterend', box);
      box.querySelectorAll('button[data-decide]').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute('data-id');
          const decision = btn.getAttribute('data-decide');
          btn.disabled = true;
          try {
            const r = await apiJson(`/api/loads/${id}/carrier-decision`, {
              method: 'POST',
              body: JSON.stringify({ decision })
            });
            const card = document.getElementById(`sw-appr-${id}`);
            if (card) card.innerHTML = `<strong style="color:#059669">✅ ${esc(r.message)}</strong>`;
          } catch (e) {
            alert(e.message);
            btn.disabled = false;
          }
        };
      });
    } catch (_) {}
  }

  function init() {
    // Only render on Dispatch, Carrier Dashboard, and Load Board — and ALWAYS inside .app-content (never across sidebar!)
    var p = (window.location.pathname || '').toLowerCase();
    var allowed = p.includes('dispatcher-dashboard') || p.includes('/dashboard') || p.includes('load-booking');
    if (!allowed) return;
    if (document.querySelector('.sw-os-bar')) return;

    injectStyles();
    const target = document.querySelector('.app-content, main.app-content, .main-content, .dashboard-container');
    if (!target) return;
    const bar = document.createElement('div');
    bar.className = 'sw-os-bar';
    bar.innerHTML = `
      <div class="sw-os-title">
        <span>🚛 Shipping Wish USA Trucking OS</span>
        <span class="sw-os-pill">● End-to-End Live</span>
      </div>
      <div class="sw-os-actions">
        <button class="sw-os-btn" id="sw-os-profit-btn">💰 AI Net-Profit Calc</button>
        <button class="sw-os-btn" style="background:#7c3aed;" id="sw-os-reload-btn">⚡ AI Reload Finder</button>
        <button class="sw-os-btn emerald" id="sw-os-approval-btn">📲 Send Carrier Approval</button>
        <button class="sw-os-btn emerald" id="sw-os-packet-btn">💸 1-Click Factoring Packet</button>
        <button class="sw-os-btn amber" id="sw-os-stl-btn">📊 Settlements &amp; Truck P&amp;L</button>
        <a class="sw-os-btn ghost" target="_blank" href="/api/loads/history-report/pdf?period=30_days">📄 30-Day History PDF</a>
      </div>
    `;
    if (target.firstChild) target.insertBefore(bar, target.firstChild);
    else target.appendChild(bar);

    document.getElementById('sw-os-profit-btn').onclick = openProfitModal;
    document.getElementById('sw-os-reload-btn').onclick = openReloadFinderModal;
    document.getElementById('sw-os-approval-btn').onclick = openSendApprovalModal;
    document.getElementById('sw-os-packet-btn').onclick = openFactoringPacketModal;
    document.getElementById('sw-os-stl-btn').onclick = openSettlementsModal;
    renderPendingCarrierApprovals(bar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

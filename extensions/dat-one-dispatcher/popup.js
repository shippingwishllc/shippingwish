/**
 * popup.js — Logic for DAT Dispatcher Chrome Extension Popup
 */

document.addEventListener('DOMContentLoaded', async () => {
  const serverSelect = document.getElementById('server-select');
  const autopilotCheck = document.getElementById('autopilot-check');
  const btnGrab = document.getElementById('btn-grab-load');
  const statusBox = document.getElementById('status-box');
  const cardContainer = document.getElementById('card-container');
  const linkWebHub = document.getElementById('link-web-hub');

  // Load saved settings
  const { apiUrl = 'https://shippingwish.com', autoPilot = false } = await chrome.storage.local.get(['apiUrl', 'autoPilot']);
  serverSelect.value = apiUrl;
  autopilotCheck.checked = autoPilot;

  serverSelect.addEventListener('change', async () => {
    await chrome.storage.local.set({ apiUrl: serverSelect.value });
    statusBox.textContent = `Server set to ${serverSelect.value}`;
  });

  autopilotCheck.addEventListener('change', async () => {
    await chrome.storage.local.set({ autoPilot: autopilotCheck.checked });
  });

  linkWebHub.addEventListener('click', async (e) => {
    e.preventDefault();
    const currentApi = serverSelect.value;
    chrome.tabs.create({ url: `${currentApi}/ai-dispatch` });
  });

  let currentParsedLoad = null;
  let currentCarriers = [];

  btnGrab.addEventListener('click', async () => {
    statusBox.textContent = 'Inspecting active tab...';
    cardContainer.style.display = 'none';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active browser tab found.');

      // Send message to content script on active tab
      const res = await chrome.tabs.sendMessage(tab.id, { action: 'GET_ACTIVE_LOAD' }).catch(() => null);

      let textToParse = res?.text;

      // Fallback: prompt user to paste if content script couldn't locate text automatically
      if (!textToParse) {
        textToParse = prompt('Paste DAT load text here (Key-Value or Table row):', `𝗗𝗛𝗢: 72\n𝗟𝗼𝗮𝗱𝗲𝗱 𝗠𝗶𝗹𝗲𝘀 : 563\n𝗙𝗿𝗼𝗺: Hopkinsville KY\n𝗧𝗼: DIBERSVILLE MS\nRATE: 1000`);
      }

      if (!textToParse) {
        statusBox.textContent = 'No load text provided.';
        return;
      }

      statusBox.textContent = 'Parsing load & matching fleet...';
      const currentApi = serverSelect.value;

      const parseRes = await fetch(`${currentApi}/api/dispatch-desk/parse-dat-loads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: textToParse })
      });
      const data = await parseRes.json();

      if (!data.ok || !data.loads?.length) {
        throw new Error(data.error || 'Could not parse DAT load');
      }

      currentParsedLoad = data.loads[0];
      currentCarriers = data.carriers || [];
      statusBox.textContent = `✓ Matched load ${currentParsedLoad.load_id}!`;

      renderCard(currentParsedLoad, currentCarriers);

      // Auto-pilot trigger
      if (autopilotCheck.checked && currentParsedLoad.suggested_carrier_id) {
        statusBox.textContent = '⚡ Auto-Pilot: Sending SMS offer to driver...';
        await sendSmsAction(currentParsedLoad);
      }
    } catch (err) {
      statusBox.textContent = `Error: ${err.message}`;
    }
  });

  function renderCard(load, carriers) {
    const rateStr = load.rate ? `$${Number(load.rate).toLocaleString()}` : 'Negotiable';
    const rpmStr = load.rpm > 0 ? ` · $${load.rpm}/mi` : '';

    const carrierOpts = carriers.map(c => `
      <option value="${c.id}" ${c.id === load.suggested_carrier_id ? 'selected' : ''}>
        ${c.company_name} (${c.phone})
      </option>
    `).join('');

    cardContainer.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="load-id">${load.load_id}</span>
          <span class="load-rate">${rateStr}${rpmStr}</span>
        </div>
        <div class="lane">${load.origin} → ${load.destination}</div>
        <div class="specs">
          DHO: <strong>${load.dho} mi</strong> · Trip: <strong>${load.loaded_miles} mi</strong> · ${load.equipment_type || 'Box Truck'} · ${Number(load.weight || 0).toLocaleString()} lbs
        </div>
        <div style="font-size:11px; color:#475569; margin-bottom:8px;">
          <strong>Broker:</strong> ${load.broker_name || 'DAT Broker'}
          ${load.broker_email ? `· ${load.broker_email}` : ''}
          ${load.broker_phone ? `· ${load.broker_phone}` : ''}
        </div>
        <label style="font-size:11px; font-weight:700; color:#334155; display:block; margin-bottom:8px;">
          Fleet Carrier:
          <select id="popup-carrier-sel" style="width:100%; margin-top:2px; padding:4px; font-size:11px; border:1px solid #cbd5e1; border-radius:4px;">
            ${carrierOpts || '<option value="">Default Fleet</option>'}
          </select>
        </label>
        <div class="actions-grid">
          <button type="button" id="btn-popup-sms" class="btn-sms">📱 Send Driver SMS Offer</button>
          <div class="btn-sub-row">
            <button type="button" id="btn-popup-email" class="btn-sub">📧 Option A: Email</button>
            <button type="button" id="btn-popup-call" class="btn-sub">📞 Option B: Call</button>
          </div>
        </div>
      </div>
    `;

    cardContainer.style.display = 'block';

    document.getElementById('btn-popup-sms').addEventListener('click', () => sendSmsAction(load));
    document.getElementById('btn-popup-email').addEventListener('click', () => sendEmailAction(load));
    document.getElementById('btn-popup-call').addEventListener('click', () => sendCallAction(load));
  }

  async function sendSmsAction(load) {
    statusBox.textContent = 'Sending SMS offer...';
    const currentApi = serverSelect.value;
    const carrierId = document.getElementById('popup-carrier-sel')?.value || load.suggested_carrier_id;

    try {
      const res = await fetch(`${currentApi}/api/dispatch-desk/send-driver-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ load, carrier_id: carrierId })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'SMS failed');
      load.active_offer_id = data.offer_id;
      statusBox.textContent = `✓ SMS Offer Sent to ${data.carrier?.phone}! Awaiting BOOK IT.`;
    } catch (err) {
      statusBox.textContent = `SMS Error: ${err.message}`;
    }
  }

  async function sendEmailAction(load) {
    let email = load.broker_email;
    if (!email) {
      email = prompt('Enter broker email address:', 'bobby@shipogre.com');
      if (!email) return;
      load.broker_email = email;
    }

    statusBox.textContent = 'Sending Option A booking email...';
    const currentApi = serverSelect.value;
    const carrierId = document.getElementById('popup-carrier-sel')?.value || load.suggested_carrier_id;

    try {
      const res = await fetch(`${currentApi}/api/dispatch-desk/contact-broker-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          load,
          offer_id: load.active_offer_id || null,
          carrier_id: carrierId,
          broker_email: email
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Email failed');
      statusBox.textContent = `✓ Booking email sent to ${email}!`;
    } catch (err) {
      statusBox.textContent = `Email Error: ${err.message}`;
    }
  }

  async function sendCallAction(load) {
    let phone = load.broker_phone;
    if (!phone) {
      phone = prompt('Enter broker phone number:', '(800) 580-3101');
      if (!phone) return;
      load.broker_phone = phone;
    }

    statusBox.textContent = 'Initiating Option B AI call...';
    const currentApi = serverSelect.value;

    try {
      const res = await fetch(`${currentApi}/api/dispatch-desk/contact-broker-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          broker_phone: phone,
          broker_name: load.broker_name,
          load,
          offer_id: load.active_offer_id || null
        })
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Call failed');
      statusBox.textContent = `✓ ${data.message}`;
    } catch (err) {
      statusBox.textContent = `Call Error: ${err.message}`;
    }
  }
});

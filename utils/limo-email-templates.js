/**
 * NYC Limo Wish — VIP Luxury Email Templates
 * Responsive, dark & gold executive chauffeur email designs for Gmail, Apple Mail, Outlook.
 */

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr + 'T12:00:00Z');
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) {
    return dateStr;
  }
}

function formatTime(timeStr) {
  if (!timeStr) return '—';
  try {
    const [h, m] = timeStr.split(':').map(Number);
    if (isNaN(h) || isNaN(m)) return timeStr;
    const period = h >= 12 ? 'PM' : 'AM';
    const hours12 = h % 12 || 12;
    return `${hours12}:${String(m).padStart(2, '0')} ${period}`;
  } catch (_) {
    return timeStr;
  }
}

function getLimoSender() {
  const custom = (process.env.NYCLIMO_MAIL_FROM || '').replace(/^["']|["']$/g, '').trim();
  if (custom) {
    const m = custom.match(/<([^>]+)>/);
    if (m && m[1]) {
      const email = m[1].trim();
      const name = custom.replace(/<[^>]+>/, '').trim() || 'NYC Limo Wish';
      return `${name} <${email}>`;
    }
    if (custom.includes('@')) {
      return `NYC Limo Wish <${custom.trim()}>`;
    }
function getLimoSender() {
  const custom = (process.env.NYCLIMO_FROM_EMAIL || process.env.NYCLIMO_SENDER || '').replace(/^["']|["']$/g, '').trim();
  if (custom) {
    if (!custom.includes('<')) return `NYC Limo Wish <${custom}>`;
    return custom;
  }
  return 'NYC Limo Wish <operations@nyclimowish.com>';
}

function getLimoReplyTo() {
  const custom = (process.env.NYCLIMO_REPLY_TO || '').replace(/^["']|["']$/g, '').trim();
  if (custom) {
    const m = custom.match(/<([^>]+)>/);
    return m ? m[1].trim() : custom;
  }
  return 'operations@nyclimowish.com';
}

function buildRideRequestReceivedHtml(booking, vehicle = {}, appUrl = 'https://www.nyclimowish.com') {
  const passengerName = [booking.passenger_first_name, booking.passenger_last_name].filter(Boolean).join(' ') || 'Valued Guest';
  const trackUrl = `${appUrl}/track?ref=${encodeURIComponent(booking.booking_number)}`;
  const vehicleName = vehicle.name || 'Executive Luxury Vehicle';
  const vehicleModels = vehicle.models || 'Premium Chauffeur Fleet';
  const isHourly = booking.service_type === 'hourly';
  const serviceLabel = isHourly ? `Hourly Charter (${booking.duration_hours || 3} Hours)` : 'Point-to-Point Direct Transfer';
  const totalFormatted = booking.total_price ? `$${Number(booking.total_price).toFixed(2)}` : 'Calculated at Booking';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reservation Confirmed — ${escapeHtml(booking.booking_number)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    table { border-collapse: collapse; }
    img { border: 0; outline: none; }
  </style>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.08);border:1px solid #e2e8f0;">
    <!-- HEADER -->
    <tr>
      <td style="background-color:#0a0a0a;padding:32px 28px;text-align:center;border-bottom:3px solid #c9a227;">
        <div style="font-size:26px;font-weight:800;letter-spacing:0.06em;color:#ffffff;margin:0 0 6px;">
          NYC <span style="color:#c9a227;">LIMO</span> WISH
        </div>
        <div style="font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">
          Executive Chauffeur &amp; Limousine Services
        </div>
      </td>
    </tr>

    <!-- STATUS BANNER -->
    <tr>
      <td style="padding:28px 28px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding:0 0 16px;">
              <span style="display:inline-block;background-color:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:12px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;padding:6px 14px;border-radius:20px;">
                ✨ Luxury Reservation Scheduled
              </span>
            </td>
          </tr>
          <tr>
            <td style="font-size:22px;font-weight:800;color:#0f172a;line-height:1.3;padding-bottom:10px;">
              Thank you for choosing NYC Limo Wish, ${escapeHtml(passengerName)}!
            </td>
          </tr>
          <tr>
            <td style="font-size:14px;color:#475569;line-height:1.6;padding-bottom:20px;">
              Your luxury reservation has been received and scheduled with NYC Limo Wish Executive Chauffeur Services. Our dedicated dispatch team is assigning your designated luxury vehicle and professional chauffeur for your upcoming itinerary.
            </td>
          </tr>
        </table>

        <!-- REFERENCE & TIME HIGHLIGHT -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1.5px dashed #cbd5e1;border-radius:10px;margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:0.04em;padding-bottom:4px;">
                    Reservation Reference
                  </td>
                  <td align="right" style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:0.04em;padding-bottom:4px;">
                    Service Type
                  </td>
                </tr>
                <tr>
                  <td style="font-size:17px;font-weight:800;color:#0f172a;font-family:monospace,sans-serif;">
                    ${escapeHtml(booking.booking_number)}
                  </td>
                  <td align="right" style="font-size:14px;font-weight:700;color:#0f172a;">
                    ${escapeHtml(serviceLabel)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- TRIP ITINERARY CARD -->
        <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#0f172a;margin-bottom:12px;">
          📍 Trip Itinerary
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
          <tr>
            <td style="padding:18px 20px;">
              <!-- Pickup -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;">
                <tr>
                  <td width="28" valign="top" style="padding-top:2px;">
                    <div style="width:22px;height:22px;background-color:#0f172a;color:#ffffff;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:800;">
                      A
                    </div>
                  </td>
                  <td style="padding-left:10px;">
                    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Pickup Location</div>
                    <div style="font-size:14px;font-weight:700;color:#0f172a;line-height:1.4;">${escapeHtml(booking.pickup_address)}</div>
                    <div style="font-size:12px;color:#059669;font-weight:600;margin-top:2px;">📅 ${formatDate(booking.pickup_date)} at 🕒 ${formatTime(booking.pickup_time)}</div>
                  </td>
                </tr>
              </table>

              <!-- Dropoff -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="28" valign="top" style="padding-top:2px;">
                    <div style="width:22px;height:22px;background-color:#c9a227;color:#ffffff;border-radius:50%;text-align:center;line-height:22px;font-size:11px;font-weight:800;">
                      B
                    </div>
                  </td>
                  <td style="padding-left:10px;">
                    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.04em;">Drop-off Destination</div>
                    <div style="font-size:14px;font-weight:700;color:#0f172a;line-height:1.4;">${escapeHtml(booking.dropoff_address || (isHourly ? 'Hourly Charter Service (Standby)' : '—'))}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- VEHICLE & PASSENGER DETAILS -->
        <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#0f172a;margin-bottom:12px;">
          🚘 Reserved Vehicle Class
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
          <tr>
            <td style="padding:18px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:16px;font-weight:800;color:#0f172a;margin-bottom:2px;">${escapeHtml(vehicleName)}</div>
                    <div style="font-size:13px;color:#64748b;font-weight:500;">${escapeHtml(vehicleModels)}</div>
                  </td>
                  <td align="right" valign="top">
                    <span style="font-size:12px;font-weight:700;color:#334155;background-color:#e2e8f0;padding:4px 10px;border-radius:6px;">
                      👥 ${booking.passengers || 1} Pax &nbsp;|&nbsp; 🧳 ${booking.luggage || 1} Bags
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- FARE BREAKDOWN -->
        <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#0f172a;margin-bottom:12px;">
          💳 Fare Summary
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:28px;">
          <tr>
            <td style="padding:18px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#475569;padding-bottom:8px;">Base Route Fare:</td>
                  <td align="right" style="font-size:13px;font-weight:600;color:#0f172a;padding-bottom:8px;">$${Number(booking.base_price || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#475569;padding-bottom:8px;">Estimated Tolls &amp; Surcharges:</td>
                  <td align="right" style="font-size:13px;font-weight:600;color:#0f172a;padding-bottom:8px;">$${Number(booking.tolls || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#475569;padding-bottom:12px;border-bottom:1px solid #f1f5f9;">Driver Gratuity (20% Tip Included):</td>
                  <td align="right" style="font-size:13px;font-weight:600;color:#0f172a;padding-bottom:12px;border-bottom:1px solid #f1f5f9;">$${Number(booking.gratuity || 0).toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="font-size:15px;font-weight:800;color:#0f172a;padding-top:12px;">Total Guaranteed Estimate:</td>
                  <td align="right" style="font-size:22px;font-weight:900;color:#c9a227;padding-top:12px;">${totalFormatted}</td>
                </tr>
                <tr>
                  <td colspan="2" style="font-size:11px;color:#16a34a;font-weight:700;padding-top:6px;">
                    ✓ 15-Minute Complimentary Chauffeur Wait Time Included
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <!-- CTA BUTTON -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
          <tr>
            <td align="center">
              <a href="${trackUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a227 0%,#9e7b16 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;padding:15px 36px;border-radius:8px;box-shadow:0 4px 15px rgba(201,162,39,0.35);letter-spacing:0.02em;">
                TRACK YOUR RIDE &amp; CHAUFFEUR ➔
              </a>
            </td>
          </tr>
        </table>

        <!-- WHAT HAPPENS NEXT -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;border-radius:10px;margin-bottom:12px;">
          <tr>
            <td style="padding:16px 20px;">
              <div style="font-size:12px;font-weight:800;color:#0f172a;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:6px;">What Happens Next?</div>
              <div style="font-size:13px;color:#475569;line-height:1.5;">
                <strong>1. Chauffeur Preparation:</strong> Your dedicated NYC Limo Wish executive chauffeur is reviewing your itinerary and preparing your vehicle.<br>
                <strong>2. Seamless Payment:</strong> You will receive a secure checkout notification to finalize your booking.<br>
                <strong>3. Real-Time Tracking:</strong> You can view live vehicle dispatch and chauffeur arrival anytime via your tracking link.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- FOOTER -->
    <tr>
      <td style="background-color:#0a0a0a;padding:26px 28px;text-align:center;color:#94a3b8;font-size:12px;line-height:1.6;">
        <div style="font-weight:700;color:#ffffff;font-size:13px;margin-bottom:4px;">NYC Limo Wish — 24/7 VIP Concierge Support</div>
        <div>Direct VIP Line: <a href="tel:+19177370021" style="color:#c9a227;text-decoration:none;">+1 (917) 737-0021</a></div>
        <div>Email: <a href="mailto:operations@nyclimowish.com" style="color:#c9a227;text-decoration:none;">operations@nyclimowish.com</a></div>
        <div style="margin-top:14px;color:#64748b;font-size:11px;">
          NYC Limo Wish is a premium luxury transportation service by Shipping Wish LLC.<br>
          19266 Coastal Hwy, Rehoboth Beach, DE 19971, USA.
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildRideConfirmedHtml(booking, vehicle = {}, appUrl = 'https://www.nyclimowish.com') {
  const passengerName = [booking.passenger_first_name, booking.passenger_last_name].filter(Boolean).join(' ') || 'Valued Guest';
  const trackUrl = `${appUrl}/track?ref=${encodeURIComponent(booking.booking_number)}`;
  const vehicleName = vehicle.name || 'Executive Luxury Vehicle';
  const totalFormatted = booking.total_price ? `$${Number(booking.total_price).toFixed(2)}` : 'Paid in Full';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ride Confirmed &amp; Paid — ${escapeHtml(booking.booking_number)}</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.08);border:1px solid #e2e8f0;">
    <tr>
      <td style="background-color:#0a0a0a;padding:32px 28px;text-align:center;border-bottom:3px solid #22c55e;">
        <div style="font-size:26px;font-weight:800;letter-spacing:0.06em;color:#ffffff;margin:0 0 6px;">
          NYC <span style="color:#c9a227;">LIMO</span> WISH
        </div>
        <div style="font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">
          Reservation Confirmed
        </div>
      </td>
    </tr>

    <tr>
      <td style="padding:28px;">
        <div style="display:inline-block;background-color:#dcfce7;color:#15803d;border:1px solid #bbf7d0;font-size:12px;font-weight:800;padding:6px 14px;border-radius:20px;margin-bottom:16px;">
          ✓ Payment Completed &amp; Chauffeur Assigned
        </div>
        <div style="font-size:22px;font-weight:800;color:#0f172a;line-height:1.3;margin-bottom:10px;">
          Your private chauffeur is locked in, ${escapeHtml(passengerName)}!
        </div>
        <div style="font-size:14px;color:#475569;line-height:1.6;margin-bottom:24px;">
          Payment of <strong>${totalFormatted}</strong> has been successfully processed. Your professional licensed chauffeur has been dispatched and will arrive on time.
        </div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;">
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;">Booking Reference</div>
              <div style="font-size:18px;font-weight:800;color:#0f172a;font-family:monospace;">${escapeHtml(booking.booking_number)}</div>
              <div style="margin-top:10px;font-size:13px;color:#0f172a;">
                <strong>Vehicle:</strong> ${escapeHtml(vehicleName)}<br>
                <strong>Pickup:</strong> ${escapeHtml(booking.pickup_address)}<br>
                <strong>Date &amp; Time:</strong> ${formatDate(booking.pickup_date)} at ${formatTime(booking.pickup_time)}
              </div>
            </td>
          </tr>
        </table>

        <div style="text-align:center;margin-bottom:24px;">
          <a href="${trackUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a227 0%,#9e7b16 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;padding:14px 34px;border-radius:8px;">
            VIEW LIVE CHAUFFEUR STATUS ➔
          </a>
        </div>
      </td>
    </tr>

    <tr>
      <td style="background-color:#0a0a0a;padding:24px 28px;text-align:center;color:#94a3b8;font-size:12px;line-height:1.6;">
        <div style="font-weight:700;color:#ffffff;font-size:13px;margin-bottom:4px;">NYC Limo Wish — VIP Executive Services</div>
        <div>24/7 VIP Line: <a href="tel:+19177370021" style="color:#c9a227;text-decoration:none;">+1 (917) 737-0021</a> | <a href="mailto:operations@nyclimowish.com" style="color:#c9a227;text-decoration:none;">operations@nyclimowish.com</a></div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildOperatorAcceptedHtml(booking, appUrl = 'https://www.nyclimowish.com') {
  const passengerName = [booking.passenger_first_name, booking.passenger_last_name].filter(Boolean).join(' ') || 'Valued Guest';
  const trackUrl = `${appUrl}/track?ref=${encodeURIComponent(booking.booking_number)}`;
  const payUrl = `${appUrl}/track?ref=${encodeURIComponent(booking.booking_number)}&pay=1`;
  const totalFormatted = booking.total_price ? `$${Number(booking.total_price).toFixed(2)}` : 'Calculated';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chauffeur Operator Accepted — ${escapeHtml(booking.booking_number)}</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.08);border:1px solid #e2e8f0;">
    <tr>
      <td style="background-color:#0a0a0a;padding:32px 28px;text-align:center;border-bottom:3px solid #c9a227;">
        <div style="font-size:26px;font-weight:800;letter-spacing:0.06em;color:#ffffff;margin:0 0 6px;">
          NYC <span style="color:#c9a227;">LIMO</span> WISH
        </div>
        <div style="font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">
          Chauffeur Accepted &amp; Payment Ready
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <div style="display:inline-block;background-color:#fef3c7;color:#92400e;border:1px solid #fde68a;font-size:12px;font-weight:800;padding:6px 14px;border-radius:20px;margin-bottom:16px;">
          ✓ Chauffeur Assigned &amp; Itinerary Ready
        </div>
        <div style="font-size:22px;font-weight:800;color:#0f172a;line-height:1.3;margin-bottom:10px;">
          Great news, ${escapeHtml(passengerName)}!
        </div>
        <div style="font-size:14px;color:#475569;line-height:1.6;margin-bottom:24px;">
          Your dedicated NYC Limo Wish executive chauffeur is assigned and ready for your ride. Please finalize your payment to guarantee your reservation.
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;">
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;">Booking Reference</div>
              <div style="font-size:18px;font-weight:800;color:#0f172a;font-family:monospace;">${escapeHtml(booking.booking_number)}</div>
              <div style="margin-top:10px;font-size:13px;color:#0f172a;line-height:1.6;">
                <strong>Pickup:</strong> ${escapeHtml(booking.pickup_address)}<br>
                <strong>Destination:</strong> ${escapeHtml(booking.dropoff_address || 'As Directed (Hourly)')}<br>
                <strong>Date &amp; Time:</strong> ${formatDate(booking.pickup_date)} at ${formatTime(booking.pickup_time)}<br>
                <strong>Total Fare:</strong> <span style="color:#c9a227;font-weight:800;">${totalFormatted}</span>
              </div>
            </td>
          </tr>
        </table>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${payUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a227 0%,#9e7b16 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;padding:15px 36px;border-radius:8px;box-shadow:0 4px 15px rgba(201,162,39,0.35);">
            COMPLETE PAYMENT TO CONFIRM RIDE ➔
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="background-color:#0a0a0a;padding:24px 28px;text-align:center;color:#94a3b8;font-size:12px;line-height:1.6;">
        <div style="font-weight:700;color:#ffffff;font-size:13px;margin-bottom:4px;">NYC Limo Wish — VIP Executive Services</div>
        <div>24/7 VIP Line: <a href="tel:+19177370021" style="color:#c9a227;text-decoration:none;">+1 (917) 737-0021</a> | <a href="mailto:operations@nyclimowish.com" style="color:#c9a227;text-decoration:none;">operations@nyclimowish.com</a></div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildRideStatusUpdateHtml(booking, status, appUrl = 'https://www.nyclimowish.com') {
  const passengerName = [booking.passenger_first_name, booking.passenger_last_name].filter(Boolean).join(' ') || 'Valued Guest';
  const trackUrl = `${appUrl}/track?ref=${encodeURIComponent(booking.booking_number)}`;
  const cleanStatus = String(status || '').replaceAll('_', ' ').toUpperCase();

  const statusDescriptions = {
    'EN_ROUTE': 'Your professional chauffeur is currently en route to your pickup location.',
    'ARRIVED': 'Your chauffeur has arrived at the pickup location and is waiting for you.',
    'IN_PROGRESS': 'Your trip is in progress. Sit back, relax, and enjoy your executive ride.',
    'COMPLETED': 'Your trip has been completed. Thank you for choosing NYC Limo Wish!',
    'CANCELLED': 'This ride reservation has been cancelled.'
  };
  const desc = statusDescriptions[String(status).toUpperCase()] || `Your ride status has been updated to ${cleanStatus}.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ride Status Update — ${escapeHtml(booking.booking_number)}</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,0.08);border:1px solid #e2e8f0;">
    <tr>
      <td style="background-color:#0a0a0a;padding:32px 28px;text-align:center;border-bottom:3px solid #c9a227;">
        <div style="font-size:26px;font-weight:800;letter-spacing:0.06em;color:#ffffff;margin:0 0 6px;">
          NYC <span style="color:#c9a227;">LIMO</span> WISH
        </div>
        <div style="font-size:12px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:#94a3b8;">
          Live Trip Status Notification
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding:28px;">
        <div style="display:inline-block;background-color:#e0f2fe;color:#0369a1;border:1px solid #bae6fd;font-size:12px;font-weight:800;padding:6px 14px;border-radius:20px;margin-bottom:16px;">
          Status: ${escapeHtml(cleanStatus)}
        </div>
        <div style="font-size:22px;font-weight:800;color:#0f172a;line-height:1.3;margin-bottom:10px;">
          Hello ${escapeHtml(passengerName)},
        </div>
        <div style="font-size:14px;color:#475569;line-height:1.6;margin-bottom:24px;">
          ${escapeHtml(desc)}
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;margin-bottom:24px;">
          <tr>
            <td style="padding:16px 20px;">
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;font-weight:700;">Booking Reference</div>
              <div style="font-size:18px;font-weight:800;color:#0f172a;font-family:monospace;">${escapeHtml(booking.booking_number)}</div>
            </td>
          </tr>
        </table>
        <div style="text-align:center;margin-bottom:24px;">
          <a href="${trackUrl}" style="display:inline-block;background:linear-gradient(135deg,#c9a227 0%,#9e7b16 100%);color:#ffffff;text-decoration:none;font-size:15px;font-weight:800;padding:14px 34px;border-radius:8px;">
            VIEW LIVE CHAUFFEUR MAP &amp; DETAILS ➔
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="background-color:#0a0a0a;padding:24px 28px;text-align:center;color:#94a3b8;font-size:12px;line-height:1.6;">
        <div style="font-weight:700;color:#ffffff;font-size:13px;margin-bottom:4px;">NYC Limo Wish — VIP Executive Services</div>
        <div>24/7 VIP Line: <a href="tel:+19177370021" style="color:#c9a227;text-decoration:none;">+1 (917) 737-0021</a> | <a href="mailto:operations@nyclimowish.com" style="color:#c9a227;text-decoration:none;">operations@nyclimowish.com</a></div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  getLimoSender,
  getLimoReplyTo,
  buildRideRequestReceivedHtml,
  buildRideConfirmedHtml,
  buildOperatorAcceptedHtml,
  buildRideStatusUpdateHtml
};

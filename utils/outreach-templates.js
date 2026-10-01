const { COMPANY, escapeHtml, unsubscribeUrl } = require('./email-templates');

const SW_URL = 'https://www.shippingwish.com';
const LN_URL = 'https://www.loadsnexus.com';

const CARRIER_STEPS = [
  { brand: 'shippingwish', gapDays: 4 },
  { brand: 'loadsnexus', gapDays: 7 },
  { brand: 'shippingwish', gapDays: 10 },
  { brand: 'shippingwish', gapDays: null }
];

const BROKER_STEPS = [
  { brand: 'loadsnexus', gapDays: 5 },
  { brand: 'loadsnexus', gapDays: 10 },
  { brand: 'loadsnexus', gapDays: null }
];

function stepsFor(kind) {
  return kind === 'broker' ? BROKER_STEPS : CARRIER_STEPS;
}

function greeting(contact) {
  const raw = String(contact.owner_name || '').trim();
  const first = raw && !/^(owner|n\/a|none)$/i.test(raw) ? raw.split(/\s+/)[0] : '';
  const name = first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : 'there';
  return `Hi ${name},`;
}

function titleCase(text) {
  return String(text || '').toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

function wrap({ brand, contact, heading, paragraphs, ctaLabel, ctaUrl }) {
  const isNexus = brand === 'loadsnexus';
  const label = isNexus ? 'LoadsNexus' : 'Shipping Wish LLC';
  const tagline = isNexus ? 'Load board by Shipping Wish LLC' : 'Fleet operations for U.S. motor carriers';
  const accent = isNexus ? '#38bdf8' : '#60a5fa';
  const unsub = unsubscribeUrl(contact.email);
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${escapeHtml(p)}</p>`).join('');
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;">
<tr><td style="background:#0f172a;padding:16px 24px;"><p style="margin:0;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:${accent};font-weight:700;">${escapeHtml(label)}</p>
<p style="margin:4px 0 0;font-size:12px;color:#cbd5e1;">${escapeHtml(tagline)}</p></td></tr>
<tr><td style="padding:26px 24px 6px;color:#1e293b;"><h1 style="margin:0 0 16px;font-size:20px;line-height:1.35;color:#0f172a;">${escapeHtml(heading)}</h1>${body}</td></tr>
${ctaLabel ? `<tr><td style="padding:4px 24px 24px;"><a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:11px 20px;border-radius:6px;">${escapeHtml(ctaLabel)}</a></td></tr>` : ''}
<tr><td style="padding:18px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.6;color:#64748b;">
<p style="margin:0 0 8px;"><strong style="color:#0f172a;">${escapeHtml(COMPANY.legal)}</strong><br>${escapeHtml(COMPANY.address)}<br>${escapeHtml(COMPANY.phone)}</p>
<p style="margin:0;">We found ${escapeHtml(contact.email)} in the public FMCSA registry for ${escapeHtml(titleCase(contact.company_name))}. Reply "no" and we will stop, or <a href="${escapeHtml(unsub)}" style="color:#64748b;">unsubscribe</a>.</p>
</td></tr></table></td></tr></table></body></html>`;
  const text = [
    heading,
    '',
    ...paragraphs,
    '',
    ctaLabel ? `${ctaLabel}: ${ctaUrl}` : '',
    '',
    `${COMPANY.legal}, ${COMPANY.address}, ${COMPANY.phone}`,
    `We found this address in the public FMCSA registry. Reply "no" and we will stop, or unsubscribe: ${unsub}`
  ].filter((line, idx, arr) => !(line === '' && arr[idx - 1] === '')).join('\n');
  return { html, text };
}

function carrierEmail(contact, step) {
  const company = titleCase(contact.company_name);
  const hello = greeting(contact);
  if (step === 0) {
    return {
      subject: `${company}: a manager for your trucks`,
      ...wrap({
        brand: 'shippingwish',
        contact,
        heading: 'A named operations manager for your company',
        paragraphs: [
          hello,
          `I'm writing from Shipping Wish LLC. We work as the back office for small U.S. trucking companies. A named manager looks for loads with brokers, handles broker setup packets and rate confirmations, and keeps your paperwork moving.`,
          'You keep the broker pay. We charge a flat weekly plan instead of a percentage. One truck is $149 a week, and the first 7 days are free with $0 due today.',
          `If ${company} could use the help, the plans are on the page below. If not, just reply "no" and we will not write again.`
        ],
        ctaLabel: 'See the plans',
        ctaUrl: `${SW_URL}/pricing`
      })
    };
  }
  if (step === 1) {
    return {
      subject: 'Prefer to book your own loads?',
      ...wrap({
        brand: 'loadsnexus',
        contact,
        heading: 'LoadsNexus is $19 a month',
        paragraphs: [
          hello,
          'If you would rather book loads yourself, LoadsNexus is our load board. Brokers post their own loads, and you call or email the broker directly.',
          'Each listing shows the broker contact, and you can check the broker’s FMCSA authority before you book. The number of loads changes day to day because it depends on what brokers post.',
          'The Solo Pass is $19 a month.'
        ],
        ctaLabel: 'Open LoadsNexus',
        ctaUrl: LN_URL
      })
    };
  }
  if (step === 2) {
    return {
      subject: `Quick follow-up for ${company}`,
      ...wrap({
        brand: 'shippingwish',
        contact,
        heading: 'Still running the office yourself?',
        paragraphs: [
          hello,
          'A short follow-up on my earlier note. Our managers take the calls, broker packets, and paperwork so you can stay on the road.',
          'The first week is free. Reply with a question anytime and a person on our desk will answer.'
        ],
        ctaLabel: 'Start 7 days free',
        ctaUrl: `${SW_URL}/pricing`
      })
    };
  }
  return {
    subject: 'Closing the loop',
    ...wrap({
      brand: 'shippingwish',
      contact,
      heading: 'Last note from Shipping Wish',
      paragraphs: [
        hello,
        'This is my last email on this. If a fleet manager or a $19 load board would help later, both links stay open.',
        'Thank you for your time, and safe miles.'
      ],
      ctaLabel: 'Shipping Wish plans',
      ctaUrl: `${SW_URL}/pricing`
    })
  };
}

function brokerEmail(contact, step) {
  const company = titleCase(contact.company_name);
  const hello = greeting(contact);
  if (step === 0) {
    return {
      subject: `${company}: post your loads free on LoadsNexus`,
      ...wrap({
        brand: 'loadsnexus',
        contact,
        heading: 'Free load posting for freight brokers',
        paragraphs: [
          hello,
          'LoadsNexus is a load board run by Shipping Wish LLC. Posting loads is free for brokers, with no contract and no listing fee.',
          'Carriers see your lane and rate and contact you directly. You can check a carrier’s FMCSA authority before you tender.',
          'You can post on the site, or reply to this email with your open loads (pickup city and state, delivery city and state, equipment, and rate) and we will post them for you.'
        ],
        ctaLabel: 'Post a load free',
        ctaUrl: `${LN_URL}/post-load`
      })
    };
  }
  if (step === 1) {
    return {
      subject: 'Any open loads this week?',
      ...wrap({
        brand: 'loadsnexus',
        contact,
        heading: 'Posting takes about two minutes',
        paragraphs: [
          hello,
          'A quick follow-up. Create a free broker account, enter the lane, equipment, and rate, and the load goes live on the board.',
          'When the load is covered, mark it covered and it comes off the board. You can also reply here with your open loads and we will post them.'
        ],
        ctaLabel: 'Post a load free',
        ctaUrl: `${LN_URL}/post-load`
      })
    };
  }
  return {
    subject: 'Last note from LoadsNexus',
    ...wrap({
      brand: 'loadsnexus',
      contact,
      heading: 'Free posting stays open',
      paragraphs: [
        hello,
        'This is my last email on this. Free load posting stays open whenever you need more carriers on a lane.',
        'Thank you for your time.'
      ],
      ctaLabel: 'Post a load free',
      ctaUrl: `${LN_URL}/post-load`
    })
  };
}

function buildOutreachEmail(contact, step) {
  return contact.kind === 'broker' ? brokerEmail(contact, step) : carrierEmail(contact, step);
}

const OUTREACH_FACTS = `Shipping Wish LLC (shippingwish.com), ${COMPANY.address}, phone ${COMPANY.phone}, toll-free +1-800-580-3101.
- Shipping Wish provides motor carriers and owner-operators with an Autonomous 24/7 AI Dispatch Manager backed by a dedicated human operations support desk available 24/7/365.
- 0% Commission: The carrier keeps 100% of the broker pay. Shipping Wish charges a flat weekly plan, NEVER a percentage of gross earnings.
- Pricing: 1 truck is $149/week. 2-5 trucks is $350/week. 6+ trucks is $500/week. First 7 days are completely free ($0 due today). Plans: ${SW_URL}/pricing.
- 1-Click DAT Matcher: High-paying spot loads matched to your truck equipment, empty ZIP, and max deadhead.
- 1-Tap Driver Booking: Driver gets load offers by SMS or mobile app showing loaded miles, RPM, and profit. Driver approves every load before booking.
- 10-Second Broker Packet Setup: Instant automated submission of W-9, COI, and MC Authority to brokers so you never lose a load while doing paperwork on the road.
- RateCon OCR Audit: AI audits broker rate confirmations before you sign to catch rate cuts, ensure $50/hr detention, and verify $250 TONU terms.
- Live Broker GPS Tracking: Eliminates broker check-calls by giving brokers a secure live tracking link and automated milestone updates.
- Same-Day Factoring: Snap a photo of the signed BOL on delivery; AI verifies the signature, generates the invoice, and auto-submits to factoring for fast pay.
- Equipment: 53' Dry Van, 53' Reefer, Flatbed, 26' Box Truck, Sprinters, Hotshots.
- LoadsNexus (loadsnexus.com) is the load board run by Shipping Wish LLC ($19/mo Solo Pass for carriers, 100% free load posting for brokers).`;

function buildCarrierSmsPitch(contact) {
  const company = titleCase(contact.company_name);
  return `Shipping Wish: Hi ${company}, tired of dispatchers taking 8-10% of your check? Get an Autonomous 24/7 AI Dispatch Manager + live human support for flat $149/wk (0% cut). 1-click DAT loads, 10-sec broker packets & instant factoring. 7 days free ($0 today): ${SW_URL}/pricing Reply STOP to opt out.`;
}

module.exports = {
  stepsFor,
  buildOutreachEmail,
  buildCarrierSmsPitch,
  titleCase,
  OUTREACH_FACTS
};

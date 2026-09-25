const SERVICES = require('../data/nyclimo/services');
const AIRPORTS = require('../data/nyclimo/airports');
const STATIC_PAGES = require('../data/nyclimo/static-pages');

const QUICK_BOOK = [
  ['jfk', 'JFK Airport'],
  ['laguardia', 'LaGuardia'],
  ['newark', 'Newark (EWR)'],
  ['hourly-hire', 'Hourly Hire', '/services/hourly-hire']
];

function quickBookLinks() {
  return QUICK_BOOK.map(([slug, label, href]) => {
    const url = href || `/airports/${slug}`;
    return `<a href="${url}" class="limo-mega-side-link">${label}</a>`;
  }).join('');
}

function airportFooterLinks() {
  return Object.values(AIRPORTS).map((a) => {
    const label = a.code === 'TEB' ? `${a.name} (TEB)` : a.name;
    return `<li><a href="/airports/${a.slug}">${label}</a></li>`;
  }).join('');
}

function pageShell(title, description, bodyExtra) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | NYC Limo Wish</title>
  <meta name="description" content="${description}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/css/limo.css">
</head>
<body class="limo">
${navHtml()}
${bodyExtra}
${footerHtml()}
<script src="/js/limo-nav.js"></script>
${bodyExtra.includes('contact-form') ? '<script src="/js/limo-contact.js"></script>' : ''}
</body>
</html>`;
}

function navHtml() {
  const personal = [
    ['airport-transfer', 'Airport Transfer', '✈'],
    ['hourly-hire', 'Hourly Hire', '⏱'],
    ['chauffeur-service', 'Chauffeur Service', '◆'],
    ['special-events', 'Special Events', '✦'],
    ['city-to-city', 'City to City', '↔'],
    ['point-to-point', 'Point to Point', '●']
  ];
  const business = [
    ['corporate-travel', 'Corporate Travel'],
    ['corporate-events', 'Corporate Events'],
    ['partner-program', 'Partner Program']
  ];

  const personalLinks = personal.map(([slug, label, icon]) =>
    `<a href="/services/${slug}" class="limo-mega-link"><span class="limo-mega-icon">${icon}</span>${label}</a>`
  ).join('');

  const businessLinks = business.map(([slug, label]) =>
    `<a href="/services/${slug}" class="limo-mega-link"><span class="limo-mega-icon">◈</span>${label}</a>`
  ).join('');

  return `
<nav class="limo-nav">
  <div class="limo-nav-inner">
    <a href="/" class="limo-logo">NYC <span>LIMO</span> WISH<span class="limo-logo-dot"></span></a>
    <div class="limo-nav-links">
      <div class="limo-nav-drop" id="services-drop">
        <button type="button" class="limo-nav-drop-btn" id="services-drop-btn" aria-expanded="false" aria-haspopup="true">
          Services <span class="limo-nav-caret">▾</span>
        </button>
        <div class="limo-mega" id="services-mega" hidden>
          <div class="limo-mega-panel">
            <div class="limo-mega-col">
              <p class="limo-mega-label">Personal Travel</p>
              <div class="limo-mega-grid">${personalLinks}</div>
            </div>
            <div class="limo-mega-col">
              <p class="limo-mega-label">Business Solutions</p>
              <div class="limo-mega-grid limo-mega-grid--2">${businessLinks}</div>
            </div>
            <div class="limo-mega-side">
              <p class="limo-mega-label">Quick Book</p>
              ${quickBookLinks()}
              <div class="limo-mega-quote-box">
                <p class="limo-mega-quote">Where Every Mile Feels Like First Class</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <a href="/#fleet">Fleet</a>
      <a href="/#cities">Cities</a>
      <a href="/#corporate">Corporate</a>
      <a href="/contact">Contact</a>
    </div>
    <div class="limo-nav-contact">
      <a href="tel:+19177370021" class="limo-nav-phone">📞 (917) 737-0021</a>
      <a href="/login" class="limo-btn limo-btn-gold limo-nav-login">Login / Register</a>
    </div>
    <button class="limo-mobile-toggle" id="mobile-toggle" aria-label="Open menu" aria-expanded="false">☰</button>
  </div>
</nav>

<div class="limo-mobile-overlay" id="mobile-overlay" hidden></div>
<aside class="limo-mobile-drawer" id="mobile-drawer" aria-hidden="true">
  <div class="limo-mobile-drawer-head">
    <span class="limo-logo">NYC <span>LIMO</span> WISH</span>
    <button type="button" id="mobile-close" aria-label="Close menu">✕</button>
  </div>
  <nav class="limo-mobile-drawer-nav">
    <button type="button" class="limo-mobile-acc-btn" id="mobile-services-btn">Services ▾</button>
    <div class="limo-mobile-acc" id="mobile-services-acc" hidden>
      ${personal.map(([slug, label]) => `<a href="/services/${slug}">${label}</a>`).join('')}
      ${business.map(([slug, label]) => `<a href="/services/${slug}">${label}</a>`).join('')}
    </div>
    <a href="/#fleet">Fleet</a>
    <a href="/#cities">Cities</a>
    <a href="/#corporate">Corporate</a>
    <a href="/contact">Contact</a>
    <a href="/book">Book Now</a>
    <a href="/login">Login / Register</a>
    <a href="tel:+19177370021" class="limo-mobile-phone">📞 (917) 737-0021</a>
  </nav>
</aside>`;
}

function footerHtml() {
  return `
<footer class="limo-footer">
  <div class="limo-footer-grid">
    <div>
      <div class="limo-logo" style="margin-bottom:16px;">NYC <span>LIMO</span> WISH</div>
      <p style="color:var(--limo-gray);font-size:0.85rem;line-height:1.6;">Premium chauffeur and limousine service across New York and the Northeast.</p>
      <div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;">
        <a href="/track">Track Booking</a> · <a href="/login">Login</a> · <a href="/driver">Drive With Us</a>
      </div>
    </div>
    <div>
      <h4>Major Airports</h4>
      <ul>${airportFooterLinks()}</ul>
    </div>
    <div>
      <h4>Services</h4>
      <ul>
        <li><a href="/services/airport-transfer">Airport Transfer</a></li>
        <li><a href="/services/hourly-hire">Hourly Hire</a></li>
        <li><a href="/services/chauffeur-service">Chauffeur Service</a></li>
        <li><a href="/services/special-events">Special Events</a></li>
        <li><a href="/services/city-to-city">City to City</a></li>
        <li><a href="/services/point-to-point">Point to Point</a></li>
      </ul>
    </div>
    <div>
      <h4>Contact</h4>
      <ul>
        <li><a href="/contact">Contact Us</a></li>
        <li><a href="mailto:info@nyclimowish.com">info@nyclimowish.com</a></li>
        <li><a href="tel:+19177370021">(917) 737-0021</a></li>
      </ul>
      <a href="/book" class="limo-btn limo-btn-gold" style="margin-top:16px;padding:10px 20px;font-size:0.75rem;">Book Now</a>
    </div>
  </div>
  <div class="limo-footer-bottom">
    <span>© 2026 NYC Limo Wish · Shipping Wish LLC. All rights reserved.</span>
    <span><a href="/terms">Terms</a> · <a href="/privacy-policy">Privacy</a> · <a href="/cancellation">Cancellation</a></span>
  </div>
</footer>`;
}

function bookUrl(service) {
  if (service.ctaLink) return service.ctaLink;
  const params = new URLSearchParams();
  if (service.bookType) params.set('type', service.bookType === 'hourly' ? 'hourly' : 'point_to_point');
  if (service.bookPickup) params.set('pickup', service.bookPickup);
  if (service.bookDropoff) params.set('dropoff', service.bookDropoff);
  return '/book?' + params.toString();
}

function airportBookUrl(airport) {
  const params = new URLSearchParams({ pickup: airport.bookPickup });
  if (airport.bookDropoff) params.set('dropoff', airport.bookDropoff);
  return '/book?' + params.toString();
}

function renderServicePage(slug) {
  const service = SERVICES[slug];
  if (!service) return null;

  const features = service.features.map((f) => `<li>${f}</li>`).join('');
  const highlights = service.highlights.map((h) =>
    `<div class="limo-svc-highlight"><h3>${h.title}</h3><p>${h.text}</p></div>`
  ).join('');
  const ctaHref = bookUrl(service);
  const ctaText = service.ctaText || 'Book This Service';

  const body = `
<header class="limo-svc-hero" style="background-image:url('${service.image}')">
  <div class="limo-svc-hero-overlay"></div>
  <div class="limo-svc-hero-inner">
    <a href="/#services" class="limo-svc-back">← All Services</a>
    <h1>${service.title}</h1>
    <p>${service.heroSubtitle}</p>
  </div>
</header>
<main class="limo-svc-main">
  <div class="limo-wrap limo-svc-grid">
    <article>
      <h2>Overview</h2>
      <p class="limo-svc-intro">${service.intro}</p>
      <h2>What's Included</h2>
      <ul class="limo-svc-features">${features}</ul>
      <div class="limo-svc-highlights">${highlights}</div>
    </article>
    <aside class="limo-svc-aside">
      <img src="${service.image}" alt="${service.title}" class="limo-svc-aside-img">
      <div class="limo-svc-aside-card">
        <h3>Ready to ride?</h3>
        <p>Instant pricing, secure payment, and professional chauffeurs — book in minutes.</p>
        <a href="${ctaHref}" class="limo-btn limo-btn-gold limo-btn-block">${ctaText}</a>
        <a href="tel:+19177370021" class="limo-svc-call">📞 (917) 737-0021</a>
      </div>
    </aside>
  </div>
</main>`;

  return pageShell(service.title, service.metaDescription, body);
}

function renderAirportPage(slug) {
  const airport = AIRPORTS[slug];
  if (!airport) return null;

  const features = airport.features.map((f) => `<li>${f}</li>`).join('');
  const bookHref = airportBookUrl(airport);

  const body = `
<header class="limo-svc-hero" style="background-image:url('${airport.image}')">
  <div class="limo-svc-hero-overlay"></div>
  <div class="limo-svc-hero-inner">
    <a href="/services/airport-transfer" class="limo-svc-back">← Airport Transfer</a>
    <h1>${airport.name} <span style="color:var(--limo-gold);font-size:0.5em;">(${airport.code})</span></h1>
    <p>${airport.subtitle}</p>
  </div>
</header>
<main class="limo-svc-main">
  <div class="limo-wrap limo-svc-grid">
    <article>
      <h2>Overview</h2>
      <p class="limo-svc-intro">${airport.intro}</p>
      <div class="limo-svc-stats">
        <div><strong>Travel Time</strong><span>${airport.travelTime}</span></div>
        <div><strong>Distance</strong><span>${airport.distance}</span></div>
      </div>
      <h2>What's Included</h2>
      <ul class="limo-svc-features">${features}</ul>
    </article>
    <aside class="limo-svc-aside">
      <img src="${airport.image}" alt="${airport.name}" class="limo-svc-aside-img">
      <div class="limo-svc-aside-card">
        <h3>Book ${airport.code} Transfer</h3>
        <p>Instant quote, flight tracking, and professional chauffeurs — reserve in minutes.</p>
        <a href="${bookHref}" class="limo-btn limo-btn-gold limo-btn-block">Book Now →</a>
        <a href="tel:+19177370021" class="limo-svc-call">📞 (917) 737-0021</a>
      </div>
    </aside>
  </div>
</main>`;

  return pageShell(`${airport.name} Car Service`, airport.metaDescription, body);
}

function renderStaticPage(slug) {
  const page = STATIC_PAGES[slug];
  if (!page) return null;

  const sections = page.sections.map((s) =>
    `<section class="limo-static-block"><h2>${s.title}</h2>${s.body}</section>`
  ).join('');

  const contactForm = page.showContactForm ? `
    <section class="limo-static-block" id="contact-form">
      <h2>Send a Message</h2>
      <form class="limo-form" id="contact-page-form" style="max-width:520px;">
        <div class="limo-field-row">
          <div class="limo-field"><label>First Name</label><input class="limo-input" name="firstName" required style="padding-left:16px;"></div>
          <div class="limo-field"><label>Last Name</label><input class="limo-input" name="lastName" required style="padding-left:16px;"></div>
        </div>
        <div class="limo-field"><label>Email</label><input class="limo-input" type="email" name="email" required style="padding-left:16px;"></div>
        <div class="limo-field"><label>Message</label><textarea class="limo-input" name="message" rows="4" required style="padding-left:16px;resize:vertical;"></textarea></div>
        <button type="submit" class="limo-btn limo-btn-gold">Send Message</button>
      </form>
    </section>` : '';

  const body = `
<header class="limo-static-hero">
  <div class="limo-wrap">
    <h1>${page.hero}</h1>
    <p>${page.intro}</p>
  </div>
</header>
<main class="limo-static-main">
  <div class="limo-wrap limo-static-content">
    ${sections}
    ${contactForm}
  </div>
</main>`;

  return pageShell(page.title, page.metaDescription, body);
}

module.exports = {
  navHtml,
  footerHtml,
  renderServicePage,
  renderAirportPage,
  renderStaticPage,
  SERVICES,
  AIRPORTS,
  STATIC_PAGES
};

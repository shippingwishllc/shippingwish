const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));

const TMS = new Set([
  'admin-dashboard.html',
  'dispatcher-dashboard.html',
  'crm-sales.html',
  'sales-dashboard.html',
  'inbox.html',
  'staff-management.html',
  'invoices.html',
  'ifta.html',
  'documents.html',
  'load-planning.html',
  'fleet.html',
  'brokers.html',
  'dashboard.html',
  'carrier-overview.html',
  'load-detail.html',
  'driver-app.html'
]);

const PUBLIC = new Set([
  'index.html',
  'services.html',
  'about.html',
  'contact.html',
  'dispatch.html',
  'load-booking.html',
  'fleet-support.html',
  'factoring.html',
  'insurance.html',
  'eld.html',
  'dot-compliance.html',
  'blog.html',
  'blog-post.html',
  'terms.html',
  'privacy-policy.html',
  'signup.html'
]);

function addBodyClass(html) {
  if (/<body[^>]*class=/.test(html)) {
    if (/<body[^>]*app-body/.test(html)) return html;
    return html.replace(/<body([^>]*class=["'])/, '<body$1app-body ');
  }
  return html.replace('<body>', '<body class="app-body">').replace('<body ', '<body class="app-body" ');
}

function ensureScript(html, src) {
  if (html.includes(src)) return html;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `<script src="${src}"></script>\n</body>`);
  }
  return html + `\n<script src="${src}"></script>\n`;
}

function switchToDesignSystem(html) {
  html = html.replace(/href="\/css\/style\.css"/g, 'href="/css/design-system.css"');
  html = html.replace(/href='\/css\/style\.css'/g, "href='/css/design-system.css'");
  return html;
}

let n = 0;
for (const file of files) {
  const fp = path.join(dir, file);
  let html = fs.readFileSync(fp, 'utf8');
  const orig = html;

  if (TMS.has(file)) {
    html = addBodyClass(html);
    html = switchToDesignSystem(html);
    html = ensureScript(html, '/js/app-shell.js');
    html = html.replace(/<style>\s*\.tms-table-v2 th, \.tms-table-v2 td \{ padding: 12px 16px; \}\s*<\/style>/g, '');
  }

  if (PUBLIC.has(file)) {
    html = switchToDesignSystem(html);
    html = ensureScript(html, '/js/site-chrome.js');
  }

  if (html !== orig) {
    fs.writeFileSync(fp, html);
    n += 1;
    console.log('updated', file);
  }
}
console.log('files changed:', n);

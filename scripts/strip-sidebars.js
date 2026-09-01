const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'public');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));
const re = /<aside class="app-sidebar[^>]*>[\s\S]*?<\/aside>/;
const replacement =
  '<aside class="app-sidebar" id="app-sidebar" role="navigation" aria-label="Portal navigation"></aside>\n  <script src="/js/app-shell-boot.js"></script>';
const changed = [];
for (const file of files) {
  const fp = path.join(dir, file);
  let html = fs.readFileSync(fp, 'utf8');
  if (!re.test(html)) continue;
  const newHtml = html.replace(re, replacement);
  if (newHtml !== html) {
    fs.writeFileSync(fp, newHtml);
    changed.push(file);
  }
}
console.log('Updated:', changed.join(', '));

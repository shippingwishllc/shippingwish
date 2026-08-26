const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'public');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.html'))) {
  const fp = path.join(dir, f);
  let h = fs.readFileSync(fp, 'utf8');
  const n = h.replace(/class="app-body" class="app-body"/g, 'class="app-body"');
  if (n !== h) {
    fs.writeFileSync(fp, n);
    console.log('fixed', f);
  }
}

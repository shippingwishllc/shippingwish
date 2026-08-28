#!/usr/bin/env node
/**
 * One-time generator for /services page hero images.
 * Uses OPENAI_API_KEY (DALL-E 3). Does NOT run on the live website.
 *
 * Usage:
 *   node scripts/generate-service-images.js
 *   node scripts/generate-service-images.js --only service-eld.png
 *   node scripts/generate-service-images.js --dry-run
 */
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.join(__dirname, '..');
const PROMPTS_PATH = path.join(ROOT, 'public/images/services/prompts.json');

function loadConfig() {
  return JSON.parse(fs.readFileSync(PROMPTS_PATH, 'utf8'));
}

function parseArgs(argv) {
  const args = { dryRun: false, only: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    if (argv[i] === '--only' && argv[i + 1]) args.only = argv[++i];
  }
  return args;
}

async function generateOne(item, cfg, apiKey) {
  const prompt = `${item.prompt}. ${cfg.style_suffix}`;
  const outDir = path.join(ROOT, cfg.output_dir);
  const outPath = path.join(outDir, item.file);

  if (fs.existsSync(outPath)) {
    console.log(`⏭  Skip (exists): ${item.file}`);
    return { skipped: true, file: item.file };
  }

  console.log(`🎨 Generating: ${item.file} — ${item.section}`);

  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: cfg.model || 'dall-e-3',
      prompt,
      n: 1,
      size: cfg.size || '1792x1024',
      quality: cfg.quality || 'standard',
      response_format: 'b64_json'
    })
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = data.error?.message || resp.statusText;
    throw new Error(`${item.file}: ${msg}`);
  }

  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error(`${item.file}: empty image response`);

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  console.log(`✅ Saved: ${path.relative(ROOT, outPath)}`);
  return { saved: true, file: item.file, path: outPath };
}

async function main() {
  const args = parseArgs(process.argv);
  const cfg = loadConfig();
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim();

  let items = cfg.images || [];
  if (args.only) {
    items = items.filter((x) => x.file === args.only);
    if (!items.length) {
      console.error(`No prompt found for file: ${args.only}`);
      process.exit(1);
    }
  }

  if (args.dryRun) {
    items.forEach((item) => {
      console.log(`\n--- ${item.file} (${item.section}) ---`);
      console.log(`${item.prompt}. ${cfg.style_suffix}`);
    });
    console.log(`\n${items.length} image(s). Set OPENAI_API_KEY and run without --dry-run.`);
    return;
  }

  if (!apiKey) {
    console.error('Missing OPENAI_API_KEY. Add it to .env or run:');
    console.error('  set OPENAI_API_KEY=sk-... && node scripts/generate-service-images.js');
    process.exit(1);
  }

  console.log(`Generating ${items.length} service image(s) → ${cfg.output_dir}\n`);

  let saved = 0;
  let skipped = 0;
  for (const item of items) {
    try {
      const result = await generateOne(item, cfg, apiKey);
      if (result.saved) saved++;
      if (result.skipped) skipped++;
      await new Promise((r) => setTimeout(r, 1500));
    } catch (err) {
      console.error(`❌ ${err.message}`);
      process.exitCode = 1;
    }
  }

  console.log(`\nDone. Saved: ${saved}, skipped: ${skipped}.`);
  console.log('Deploy the PNG files with your site — services.html already points to them.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

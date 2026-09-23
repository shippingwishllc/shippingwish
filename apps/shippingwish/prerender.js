import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function prerender() {
  const templatePath = path.resolve(__dirname, 'dist/index.html');
  const ssrEntryPath = path.resolve(__dirname, 'dist-ssr/entry-server.js');

  if (!fs.existsSync(templatePath)) {
    console.error(`[SSG] Error: Template file not found at ${templatePath}`);
    process.exit(1);
  }

  if (!fs.existsSync(ssrEntryPath)) {
    console.error(`[SSG] Error: SSR build output not found at ${ssrEntryPath}`);
    process.exit(1);
  }

  console.log('[SSG] Pre-rendering ShippingWish™ Static HTML5...');
  const template = fs.readFileSync(templatePath, 'utf-8');

  const { render } = await import(pathToFileURL(ssrEntryPath).href);
  const appHtml = render();

  const finalHtml = template.replace('<!--app-html-->', appHtml);

  fs.writeFileSync(templatePath, finalHtml, 'utf-8');
  console.log(`[SSG] Successfully pre-rendered static HTML5 to ${templatePath} (${finalHtml.length} bytes)`);

  // Sync to public/
  const publicDir = path.resolve(__dirname, '../../public');
  if (fs.existsSync(publicDir)) {
    console.log(`[SSG] Synchronizing pre-rendered index.html to ${publicDir}...`);
    
    // Copy index.html
    fs.writeFileSync(path.join(publicDir, 'index.html'), finalHtml, 'utf-8');

    // Copy dist/assets into public/assets
    const distAssetsDir = path.resolve(__dirname, 'dist/assets');
    const targetAssetsDir = path.join(publicDir, 'assets');
    if (fs.existsSync(distAssetsDir)) {
      if (!fs.existsSync(targetAssetsDir)) {
        fs.mkdirSync(targetAssetsDir, { recursive: true });
      }
      const files = fs.readdirSync(distAssetsDir);
      for (const file of files) {
        fs.copyFileSync(
          path.join(distAssetsDir, file),
          path.join(targetAssetsDir, file)
        );
      }
      console.log(`[SSG] Copied ${files.length} asset bundle(s) to ${targetAssetsDir}`);
    }
  }

  console.log('[SSG] Completed with 100% success.');
}

prerender().catch((err) => {
  console.error('[SSG] Prerender failed:', err);
  process.exit(1);
});

import { existsSync, readFileSync } from 'node:fs';

const errors = [];
for (const filename of [
  'dist/index.html',
  'dist/service-worker.js',
  'dist/manifest.webmanifest',
  'dist/assets/app.js',
  '.github/workflows/pages.yml',
]) {
  if (!existsSync(filename)) errors.push('Releasefil mangler: ' + filename);
}

if (existsSync('dist/index.html')) {
  const html = readFileSync('dist/index.html', 'utf8');
  if (/supabase|vercel/i.test(html))
    errors.push('Produktionsbygningen må ikke afhænge af Supabase eller Vercel.');
}

if (errors.length) {
  console.error('Releasekontrollen stoppede:\n- ' + errors.join('\n- '));
  process.exit(1);
}

console.log('Releasekontrol bestået: den lokale PWA og GitHub Pages-filerne er klar.');

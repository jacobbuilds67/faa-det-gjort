import { existsSync, readFileSync } from 'node:fs';

function localEnvironment() {
  const values = {};
  for (const filename of ['.env', '.env.local']) {
    if (!existsSync(filename)) continue;
    for (const line of readFileSync(filename, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return { ...values, ...process.env };
}

const environment = localEnvironment();
const url = environment.VITE_SUPABASE_URL ?? '';
const key = environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? '';
const errors = [];

try {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co'))
    errors.push('VITE_SUPABASE_URL skal være en HTTPS-adresse til et Supabase-projekt.');
} catch {
  errors.push('VITE_SUPABASE_URL mangler eller er ugyldig.');
}

if (key.length < 20) errors.push('VITE_SUPABASE_PUBLISHABLE_KEY mangler eller er for kort.');
if (/secret|service[_-]?role/i.test(key) || key.startsWith('sb_secret_'))
  errors.push('Der må aldrig bruges en secret/service-role key i frontend.');

for (const filename of [
  'dist/index.html',
  'dist/service-worker.js',
  'supabase/migrations/001_foundation.sql',
  'supabase/migrations/002_queue_and_time.sql',
  'supabase/migrations/003_recurrence.sql',
  'supabase/migrations/004_projects.sql',
]) {
  if (!existsSync(filename)) errors.push(`Releasefil mangler: ${filename}`);
}

if (errors.length) {
  console.error(`Releasekontrollen stoppede:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

console.log(
  'Releasekontrol bestået: build, migrationer og offentlige Supabase-indstillinger er klar.',
);

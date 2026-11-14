// Supabase adresi ve publishable anahtar: önce ortam değişkenleri (CI), yoksa proje kökündeki .env.web.
// EROMEC_OFFLINE=1 verilirse ikisi de boş döner (çevrimdışı masaüstü derlemesi, e2e testleri).
import fs from 'node:fs';
import path from 'node:path';

export function serverEnv(root = process.cwd()) {
  if (process.env.EROMEC_OFFLINE === '1') return { url: '', key: '' };
  const file = path.join(root, '.env.web');
  const vars = {};
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const pick = (k) => (process.env[k] ?? vars[k] ?? '').trim();
  return { url: pick('VITE_SUPABASE_URL'), key: pick('VITE_SUPABASE_ANON_KEY') };
}

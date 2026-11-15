import type { AppSettings, ThemeMode } from '../../shared/types';
import { CURRENCY_SYMBOLS } from '../../shared/money';
import type { Db } from './connection';
import { logActivity } from './activity';
import { fail, requiredText } from './validation';

const THEMES: ThemeMode[] = ['light', 'dark', 'system'];

export function getSettings(db: Db): AppSettings {
  const rows = db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    companyName: map.get('companyName') ?? 'Firmam',
    // Eski adla kaydedilmiş uygulama adı yeni ada çevrilir (EroMec → Puanto)
    appName: (map.get('appName') === 'EroMec' ? undefined : map.get('appName')) ?? 'Puanto',
    currency: map.get('currency') ?? 'TRY',
    theme: THEMES.includes(map.get('theme') as ThemeMode) ? (map.get('theme') as ThemeMode) : 'light',
    dailyMinWageKurus: Number(map.get('dailyMinWageKurus') ?? 0) || 0,
  };
}

export function saveSettings(db: Db, s: AppSettings): AppSettings {
  const companyName = requiredText(s?.companyName, 'Şirket adı', 100);
  const appName = requiredText(s?.appName, 'Uygulama adı', 50);
  const currency = String(s?.currency ?? '');
  if (!CURRENCY_SYMBOLS[currency]) fail('Geçersiz para birimi.');
  const theme = s?.theme ?? 'light';
  if (!THEMES.includes(theme)) fail('Geçersiz görünüm seçimi.');
  const dailyMinWage = s?.dailyMinWageKurus ?? 0;
  if (!Number.isInteger(dailyMinWage) || dailyMinWage < 0 || dailyMinWage > 100_000_000) fail('Günlük asgari ücret geçersiz.');
  db.tx(() => {
    const upsert = 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';
    db.run(upsert, ['companyName', companyName]);
    db.run(upsert, ['appName', appName]);
    db.run(upsert, ['currency', currency]);
    db.run(upsert, ['theme', theme]);
    db.run(upsert, ['dailyMinWageKurus', String(dailyMinWage)]);
    logActivity(db, 'settings', null, 'update', 'Ayarlar güncellendi');
  });
  return getSettings(db);
}

export function currencySymbol(db: Db): string {
  return CURRENCY_SYMBOLS[getSettings(db).currency] ?? '₺';
}

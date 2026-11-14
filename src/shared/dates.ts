// Tarihler veritabanında "YYYY-AA-GG" (ISO) metni olarak saklanır,
// ekranda "GG.AA.YYYY" biçiminde gösterilir. Hafta pazartesi başlar.

export interface DateRange {
  from: string; // dahil
  to: string; // dahil
}

const pad = (n: number) => String(n).padStart(2, '0');

export function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIsoDate(now);
}

export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidIsoDate(iso: unknown): iso is string {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = parseIsoDate(iso);
  return toIsoDate(d) === iso && d.getFullYear() >= 1900 && d.getFullYear() <= 2200;
}

/** "2026-10-15" -> "15.10.2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

/** "15.10.2026" veya "2026-10-15" -> "2026-10-15"; geçersizse null */
export function parseDisplayDate(text: string): string | null {
  const t = text.trim();
  if (isValidIsoDate(t)) return t;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return isValidIsoDate(iso) ? iso : null;
}

/** SQLite zaman damgasını ("2026-10-15 12:30:00" UTC) yerel "GG.AA.YYYY SS:DD" yapar. */
export function formatDateTime(utc: string): string {
  const d = new Date(utc.replace(' ', 'T') + (utc.endsWith('Z') ? '' : 'Z'));
  if (Number.isNaN(d.getTime())) return utc;
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIsoDate(d);
}

export function dayRange(iso: string): DateRange {
  return { from: iso, to: iso };
}

/** Pazartesi başlayan hafta. */
export function weekRange(iso: string): DateRange {
  const d = parseIsoDate(iso);
  const dow = (d.getDay() + 6) % 7; // pazartesi=0 ... pazar=6
  const from = addDays(iso, -dow);
  return { from, to: addDays(from, 6) };
}

export function monthRange(iso: string): DateRange {
  const d = parseIsoDate(iso);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { from: toIsoDate(first), to: toIsoDate(last) };
}

export const MONTH_NAMES = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

/** "2026-10" -> "Ekim 2026" */
export function formatPeriod(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (!y || !m) return period;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

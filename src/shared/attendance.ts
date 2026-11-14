// Puantaj durumları ("fırçalar"). Veritabanındaki attendance_statuses tablosundan gelir ve
// kullanıcı tarafından düzenlenebilir: hücrede görünen yazı, ad, renk, ücretli/çalışılan gün değeri.

export type AttendanceStatus = string;

export interface StatusDef {
  code: AttendanceStatus; // değişmeyen iç kod (X, Y, I ... veya özel: C1, C2 ...)
  short: string; // hücrede görünen yazı (ör. "8", "4", "İ")
  label: string; // fırçanın adı
  color: string; // hücre arka plan rengi (#RRGGBB)
  /** Ücretli gün değeri ×2: 2 = tam gün, 1 = yarım gün, 0 = ücretsiz */
  paidHalf: number;
  /** Çalışılan gün değeri ×2 ("Gün" sütunu) */
  workedHalf: number;
  isSystem: boolean;
  sortOrder: number;
}

export const DEFAULT_STATUSES: StatusDef[] = [
  { code: 'X', short: '8', label: 'Çalıştı (tam gün)', color: '#15803d', paidHalf: 2, workedHalf: 2, isSystem: true, sortOrder: 1 },
  { code: 'Y', short: '4', label: 'Yarım gün', color: '#4d7c0f', paidHalf: 1, workedHalf: 1, isSystem: true, sortOrder: 2 },
  { code: 'I', short: 'İ', label: 'Ücretli izin', color: '#1d4ed8', paidHalf: 2, workedHalf: 0, isSystem: true, sortOrder: 3 },
  { code: 'U', short: 'Üİ', label: 'Ücretsiz izin', color: '#4338ca', paidHalf: 0, workedHalf: 0, isSystem: true, sortOrder: 4 },
  { code: 'R', short: 'R', label: 'Raporlu', color: '#b45309', paidHalf: 0, workedHalf: 0, isSystem: true, sortOrder: 5 },
  { code: 'D', short: '0', label: 'Devamsız', color: '#b91c1c', paidHalf: 0, workedHalf: 0, isSystem: true, sortOrder: 6 },
  { code: 'T', short: 'T', label: 'Resmi tatil', color: '#7e22ce', paidHalf: 2, workedHalf: 0, isSystem: true, sortOrder: 7 },
  { code: 'H', short: 'H', label: 'Hafta tatili', color: '#4b5563', paidHalf: 2, workedHalf: 0, isSystem: true, sortOrder: 8 },
];

/** Arka plan rengine göre okunaklı yazı rengi (koyu zeminde beyaz, açık zeminde siyah). */
export function textColorFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111827' : '#ffffff';
}

export type StatusMap = Record<AttendanceStatus, StatusDef>;
export const toStatusMap = (list: StatusDef[]): StatusMap => Object.fromEntries(list.map((s) => [s.code, s]));

export interface AttendanceTotals {
  /** Çalışılan gün ("Gün" sütunu) */
  workedDays: number;
  /** Ücretli gün (maaş hesabı) */
  paidDays: number;
  counts: Record<AttendanceStatus, number>;
}

export function attendanceTotals(cells: Record<string, AttendanceStatus>, statuses: StatusMap): AttendanceTotals {
  const counts: Record<string, number> = {};
  let worked = 0;
  let paid = 0;
  for (const st of Object.values(cells)) {
    counts[st] = (counts[st] ?? 0) + 1;
    worked += statuses[st]?.workedHalf ?? 0;
    paid += statuses[st]?.paidHalf ?? 0;
  }
  return { workedDays: worked / 2, paidDays: paid / 2, counts };
}

/** 1,5 -> "1,5"; 22 -> "22" */
export const formatDays = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export const WEEKDAY_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

export const DAY_VALUE_LABEL: Record<number, string> = { 2: 'Tam gün (1)', 1: 'Yarım gün (0,5)', 0: 'Sayılmaz (0)' };

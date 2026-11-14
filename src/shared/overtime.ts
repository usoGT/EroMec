// Mesai süresi ve tutar hesaplama kuralları.

export interface OvertimeCalcInput {
  startTime: string; // "SS:DD"
  endTime: string; // "SS:DD"
  breakMinutes: number;
  hourlyRateKurus: number;
}

export interface OvertimeCalcResult {
  workedMinutes: number;
  totalKurus: number;
  crossesMidnight: boolean;
}

export function parseTime(t: unknown): number | null {
  if (typeof t !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function normalizeTime(t: string): string | null {
  const v = parseTime(t);
  if (v === null) return null;
  return `${String(Math.floor(v / 60)).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`;
}

/**
 * Bitiş saati başlangıçtan küçükse mesai gece yarısını aşmış kabul edilir.
 * Başlangıç ile bitiş aynıysa (0 saat) kayıt geçersizdir.
 * Tutar = dakika × saatlik ücret / 60, en yakın kuruşa yuvarlanır.
 */
export function calculateOvertime(input: OvertimeCalcInput): OvertimeCalcResult {
  const start = parseTime(input.startTime);
  const end = parseTime(input.endTime);
  if (start === null) throw new Error('Başlangıç saati geçersiz. Örnek: 18:00');
  if (end === null) throw new Error('Bitiş saati geçersiz. Örnek: 21:30');
  if (start === end) throw new Error('Başlangıç ve bitiş saati aynı olamaz.');
  const crossesMidnight = end < start;
  const span = crossesMidnight ? end + 24 * 60 - start : end - start;
  const brk = input.breakMinutes;
  if (!Number.isInteger(brk) || brk < 0) throw new Error('Mola süresi 0 veya daha büyük bir tam sayı (dakika) olmalıdır.');
  if (brk >= span) throw new Error('Mola süresi toplam çalışma süresinden kısa olmalıdır.');
  const rate = input.hourlyRateKurus;
  if (!Number.isInteger(rate) || rate < 0) throw new Error('Saatlik mesai ücreti geçersiz.');
  const workedMinutes = span - brk;
  const totalKurus = Math.round((workedMinutes * rate) / 60);
  return { workedMinutes, totalKurus, crossesMidnight };
}

/** 150 -> "2,50 saat" gösterimi için ondalık saat; 150 -> "2 sa 30 dk" */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} dk`;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

export function formatHoursDecimal(min: number): string {
  return (Math.round((min / 60) * 100) / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

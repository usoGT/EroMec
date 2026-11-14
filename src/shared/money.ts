// Para değerleri her yerde kuruş cinsinden tam sayı olarak tutulur.
// Bu dosya kullanıcı girdisini kuruşa çevirir ve kuruşu ekranda biçimlendirir.

export const CURRENCY_SYMBOLS: Record<string, string> = { TRY: '₺', USD: '$', EUR: '€' };

/**
 * "1.250,50", "1250,5", "1250.50", "₺ 1.250" gibi girdileri kuruşa çevirir.
 * Geçersiz girdide null döner. Kayan nokta aritmetiği kullanılmaz.
 */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return parseMoney(input.toFixed(2));
  }
  let s = input.replace(/[₺$€\s]/g, '').replace(/TL$/i, '');
  if (s === '') return null;
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let intPart: string;
  let fracPart = '';
  if (lastComma >= 0 && lastDot >= 0) {
    // İkisi birden varsa en sağdaki ondalık ayırıcıdır.
    const decIdx = Math.max(lastComma, lastDot);
    intPart = s.slice(0, decIdx).replace(/[.,]/g, '');
    fracPart = s.slice(decIdx + 1);
  } else if (lastComma >= 0) {
    if (s.indexOf(',') !== lastComma) {
      // Birden çok virgül: binlik ayırıcı (ör. 1,250,000)
      if (!/^\d{1,3}(,\d{3})+$/.test(s)) return null;
      intPart = s.replace(/,/g, '');
    } else {
      intPart = s.slice(0, lastComma);
      fracPart = s.slice(lastComma + 1);
    }
  } else if (lastDot >= 0) {
    if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      // 1.250 veya 1.250.000 -> binlik ayırıcı (Türkçe yazım)
      intPart = s.replace(/\./g, '');
    } else if (s.indexOf('.') === lastDot) {
      intPart = s.slice(0, lastDot);
      fracPart = s.slice(lastDot + 1);
    } else {
      return null;
    }
  } else {
    intPart = s;
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || !/^\d{0,2}$/.test(fracPart)) return null;
  if (intPart.length > 13) return null;
  const kurus = Number(intPart) * 100 + Number((fracPart + '00').slice(0, 2));
  return negative ? -kurus : kurus;
}

/** Kuruşu "1.250,50 ₺" biçiminde gösterir. */
export function formatMoney(kurus: number | null | undefined, symbol = '₺'): string {
  if (kurus === null || kurus === undefined || !Number.isFinite(kurus)) return '';
  const negative = kurus < 0;
  const abs = Math.abs(Math.round(kurus));
  const lira = Math.floor(abs / 100);
  const k = abs % 100;
  const liraStr = String(lira).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${liraStr},${String(k).padStart(2, '0')} ${symbol}`;
}

/** Kuruşu düzenleme kutusunda gösterilecek düz metne çevirir: "1250,50" */
export function moneyToInput(kurus: number | null | undefined): string {
  if (kurus === null || kurus === undefined) return '';
  const abs = Math.abs(kurus);
  return `${kurus < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

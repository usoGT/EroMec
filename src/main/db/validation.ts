// Girdi doğrulama yardımcıları. Hata mesajları doğrudan kullanıcıya gösterilir.
import { isValidIsoDate } from '../../shared/dates';

export class UserError extends Error {}

export function fail(message: string): never {
  throw new UserError(message);
}

export function text(v: unknown, max = 500): string {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') fail('Geçersiz metin değeri.');
  const t = v.trim();
  if (t.length > max) fail(`Metin en fazla ${max} karakter olabilir.`);
  return t;
}

/** Türkçe büyük/küçük harf duyarsız karşılaştırma anahtarı (İ/i, I/ı, Ş/ş ...). */
export function trKey(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

export function requiredText(v: unknown, label: string, max = 200): string {
  const t = text(v, max);
  if (!t) fail(`${label} boş bırakılamaz.`);
  return t;
}

export function kurus(v: unknown, label: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${label} geçersiz.`);
  if (v < 0) fail(`${label} negatif olamaz.`);
  if (v > 100_000_000_000) fail(`${label} çok büyük.`);
  return v;
}

export function isoDate(v: unknown, label: string): string {
  if (!isValidIsoDate(v)) fail(`${label} geçersiz. Lütfen GG.AA.YYYY biçiminde bir tarih seçin.`);
  return v;
}

export function optionalIsoDate(v: unknown, label: string): string | null {
  if (v === null || v === undefined || v === '') return null;
  return isoDate(v, label);
}

export function id(v: unknown, label = 'Kayıt'): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) fail(`${label} seçilmedi.`);
  return v;
}

export function period(v: unknown): string {
  if (typeof v !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) fail('Maaş dönemi geçersiz (ay ve yıl seçin).');
  return v;
}

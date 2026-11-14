import { describe, expect, it } from 'vitest';
import { formatMoney, moneyToInput, parseMoney } from '../src/shared/money';

describe('parseMoney (kuruş)', () => {
  it.each([
    ['1250', 125000],
    ['1250,5', 125050],
    ['1250,50', 125050],
    ['1.250,50', 125050],
    ['1.250', 125000],
    ['1.250.000', 125000000],
    ['1250.75', 125075],
    ['1,250.75', 125075],
    ['₺ 99,99', 9999],
    ['0,1', 10],
    [',5', 50],
    ['0', 0],
  ])('%s -> %i', (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(['', 'abc', '12,345,6', '1,234', '10,999', '1.2.3'])('geçersiz: %s', (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it('kayan nokta hatası üretmez', () => {
    expect(parseMoney('0,1')! + parseMoney('0,2')!).toBe(30);
    expect(parseMoney(0.29)).toBe(29);
  });
});

describe('formatMoney', () => {
  it('Türkçe biçimde gösterir', () => {
    expect(formatMoney(125050)).toBe('1.250,50 ₺');
    expect(formatMoney(0)).toBe('0,00 ₺');
    expect(formatMoney(5)).toBe('0,05 ₺');
    expect(formatMoney(-123456789)).toBe('-1.234.567,89 ₺');
    expect(moneyToInput(125005)).toBe('1250,05');
  });
});

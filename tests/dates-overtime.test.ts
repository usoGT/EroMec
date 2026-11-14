import { describe, expect, it } from 'vitest';
import { formatDate, monthRange, parseDisplayDate, weekRange, isValidIsoDate } from '../src/shared/dates';
import { calculateOvertime } from '../src/shared/overtime';

describe('tarih aralıkları', () => {
  it('hafta pazartesi başlar', () => {
    // 15.10.2026 perşembe
    expect(weekRange('2026-10-15')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    // pazar günü bir önceki pazartesiye bağlıdır
    expect(weekRange('2026-10-18')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    // pazartesi kendisi
    expect(weekRange('2026-10-12')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    // ay/yıl sınırını aşan hafta
    expect(weekRange('2027-01-01')).toEqual({ from: '2026-12-28', to: '2027-01-03' });
  });
  it('ay aralığı ve artık yıl', () => {
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthRange('2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRange('2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });
  it('gün.ay.yıl biçimi', () => {
    expect(formatDate('2026-10-05')).toBe('05.10.2026');
    expect(parseDisplayDate('5.10.2026')).toBe('2026-10-05');
    expect(parseDisplayDate('31.02.2026')).toBeNull();
    expect(isValidIsoDate('2026-13-01')).toBe(false);
  });
});

describe('mesai hesaplama', () => {
  it('mola düşülür ve tutar hesaplanır', () => {
    const r = calculateOvertime({ startTime: '18:00', endTime: '21:30', breakMinutes: 30, hourlyRateKurus: 15000 });
    expect(r.workedMinutes).toBe(180);
    expect(r.totalKurus).toBe(45000);
    expect(r.crossesMidnight).toBe(false);
  });
  it('gece yarısını aşan mesai', () => {
    const r = calculateOvertime({ startTime: '22:00', endTime: '02:15', breakMinutes: 15, hourlyRateKurus: 20000 });
    expect(r.workedMinutes).toBe(240);
    expect(r.totalKurus).toBe(80000);
    expect(r.crossesMidnight).toBe(true);
  });
  it('kuruş yuvarlaması tam sayıdır', () => {
    // 50 dk × 100,01 ₺ / 60 = 83,3416… ₺ -> 8334 kuruş
    const r = calculateOvertime({ startTime: '08:00', endTime: '08:50', breakMinutes: 0, hourlyRateKurus: 10001 });
    expect(r.totalKurus).toBe(8334);
    expect(Number.isInteger(r.totalKurus)).toBe(true);
  });
  it('hatalı süreler engellenir', () => {
    expect(() => calculateOvertime({ startTime: '18:00', endTime: '18:00', breakMinutes: 0, hourlyRateKurus: 1 })).toThrow(/aynı olamaz/);
    expect(() => calculateOvertime({ startTime: '18:00', endTime: '19:00', breakMinutes: 60, hourlyRateKurus: 1 })).toThrow(/Mola/);
    expect(() => calculateOvertime({ startTime: '18:00', endTime: '19:00', breakMinutes: -5, hourlyRateKurus: 1 })).toThrow(/Mola/);
    expect(() => calculateOvertime({ startTime: '25:00', endTime: '19:00', breakMinutes: 0, hourlyRateKurus: 1 })).toThrow(/Başlangıç/);
    expect(() => calculateOvertime({ startTime: '18:00', endTime: '7', breakMinutes: 0, hourlyRateKurus: 1 })).toThrow(/Bitiş/);
  });
});

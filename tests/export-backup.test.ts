import { describe, expect, it } from 'vitest';
import { openService } from './helpers';
import { buildReportCsv, buildReportHtml } from '../src/main/db/export';

describe('dışa aktarma', () => {
  it('CSV Türkçe karakterli, BOM ve noktalı virgül ile üretilir', async () => {
    const { svc } = await openService();
    const cat = svc.categoriesList().find((c) => c.name === 'Yemek')!;
    svc.expenseCreate({ input: { date: '2026-10-15', name: 'Öğle; yemeği "özel"', categoryId: cat.id, amountKurus: 125050, isPaid: false } });
    const csv = buildReportCsv(svc.reportData('2026-10-01', '2026-10-31', 'Aylık Rapor'));
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('Diğer giderler;1250,50;Maaş ve ek mesai dışındaki giderler');
    expect(csv).toContain('TOPLAM MALİYET;1250,50');
    expect(csv).toContain('TOPLAM GİDER;1250,50');
    expect(csv).toContain('FARK (maliyet − gider);0,00');
    expect(csv).toContain('15.10.2026;;"Öğle; yemeği ""özel""";Yemek;1250,50;Ödenmedi;');
    expect(csv).toContain('Ödenmemiş (borç);1250,50');
    const html = buildReportHtml(svc.reportData('2026-10-01', '2026-10-31', 'Aylık Rapor'));
    expect(html).toContain('1.250,50 ₺');
    expect(html).toContain('Öğle; yemeği &quot;özel&quot;');
  });
});

describe('yedekleme ve geri yükleme', () => {
  it('yedek alınır ve geri yüklenir', async () => {
    const { svc } = await openService();
    svc.employeeCreate({ input: { fullName: 'Yedekteki Kişi', position: 'Usta', monthlySalaryKurus: 0, overtimeRateKurus: 0, startDate: null, status: 'active' } });
    const backup = svc.backupBytes();
    svc.employeeCreate({ input: { fullName: 'Sonradan Eklenen', position: 'Çırak', monthlySalaryKurus: 0, overtimeRateKurus: 0, startDate: null, status: 'active' } });
    expect(svc.employeesList()).toHaveLength(2);
    svc.restore(backup);
    expect(svc.employeesList().map((e) => e.fullName)).toEqual(['Yedekteki Kişi']);
    expect(svc.dashboard('2026-10-15').recent[0].summary).toMatch(/yedekten geri yüklendi/);
  });

  it('geçersiz dosya reddedilir, mevcut veri bozulmaz', async () => {
    const { svc, db } = await openService();
    svc.employeeCreate({ input: { fullName: 'Kalıcı', position: 'Usta', monthlySalaryKurus: 0, overtimeRateKurus: 0, startDate: null, status: 'active' } });
    expect(() => svc.restore(new TextEncoder().encode('bu bir veritabanı değil'.repeat(10)))).toThrow(/geçerli bir Puanto yedeği değil/);
    // Başka bir SQLite dosyası (EroMec tabloları yok)
    const foreign = new db.SQL.Database();
    foreign.exec('CREATE TABLE x (a)');
    expect(() => svc.restore(foreign.export())).toThrow(/gerekli tablolar/);
    expect(svc.employeesList()).toHaveLength(1);
  });
});

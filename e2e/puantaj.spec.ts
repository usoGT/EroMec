// Uçtan uca: puantaj tablosu, toplu doldurma, fırça ile işaretleme, Excel ve PDF indirme.
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { EroMecApi } from '../src/shared/api';

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.EROMEC_SHOTS_DIR;
const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Ana menü' }).getByRole('button', { name: label }).click();
const cell = (page: Page, name: string, date: string) => page.locator(`tr[data-employee="${name}"] td[data-cell$=":${date}"]`);
const worked = (page: Page, name: string) => page.locator(`tr[data-employee="${name}"] [data-testid=worked-days]`);

test('puantaj: doldurma, işaretleme, Excel/PDF', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eromec-e2e-puantaj-'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eromec-e2e-puantaj-out-'));
  const app = await electron.launch({ args: [ROOT, '--no-sandbox'], env: { ...process.env, EROMEC_DATA_DIR: dataDir, VITE_DEV_SERVER_URL: '' } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1500, height: 860 });
  await expect(page.getByTestId('app-name')).toHaveText('Puanto');

  // Hazırlık: arayüzün kullandığı API ile firma, şantiye ve çalışan ekle
  await page.evaluate(async () => {
    const api = (window as unknown as { eromec: EroMecApi }).eromec;
    const main = (await api.companiesList())[0];
    const other = await api.companySave({ input: { name: 'Yıldız İnşaat', taxOffice: '', taxNo: '', phone: '', address: '', notes: '' } });
    const a = await api.siteSave({ input: { companyId: main.id, name: 'Merkez Atölye', address: '', startDate: null, endDate: null, status: 'active', notes: '' } });
    const b = await api.siteSave({ input: { companyId: other.id, name: 'Ataşehir Konutları', address: '', startDate: null, endDate: null, status: 'active', notes: '' } });
    const add = (fullName: string, siteId: number) =>
      api.employeeCreate({ input: { fullName, position: 'Usta', monthlySalaryKurus: 3_000_000, overtimeRateKurus: 10000, startDate: null, status: 'active', siteId } });
    await add('Ali Kaya', b.id);
    await add('Veli Demir', b.id);
    await add('Can Öz', b.id);
    await add('Mert Usta', a.id);
  });

  // Ayarlar: günlük asgari ücret 730,00 ₺
  await nav(page, 'Ayarlar');
  await page.locator('input[name=dailyMinWage]').fill('730');
  await expect(page.getByText('Aylık (30 gün): 21.900,00 ₺')).toBeVisible();
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Ayarlar kaydedildi.')).toBeVisible();

  await nav(page, 'Puantaj');
  await expect(page.getByRole('heading', { name: 'Puantaj' })).toBeVisible();
  // Ekim 2026'ya git
  const now = new Date();
  const diff = (2026 - now.getFullYear()) * 12 + (9 - now.getMonth());
  for (let i = 0; i < Math.abs(diff); i++) await page.getByRole('button', { name: diff > 0 ? 'Sonraki ay' : 'Önceki ay' }).click();
  await expect(page.getByTestId('attendance-month')).toHaveText('Ekim 2026');
  await expect(page.locator('tr[data-employee]')).toHaveCount(4);
  await page.getByLabel('Firma / şantiye filtresi').selectOption({ label: 'Ataşehir Konutları' });
  await expect(page.locator('tr[data-employee]')).toHaveCount(3);

  // Boş günleri doldur (bütün ay, cumartesi çalışılıyor): 31 - 4 pazar = 27 gün
  await page.getByRole('button', { name: 'Boş günleri doldur' }).click();
  const fill = page.getByRole('dialog', { name: 'Boş günleri doldur' });
  await fill.locator('input[name=untilToday]').uncheck();
  await fill.getByRole('button', { name: 'Doldur' }).click();
  await expect(page.getByText('93 hücre dolduruldu.')).toBeVisible();
  await expect(worked(page, 'Ali Kaya')).toHaveText('27');
  await expect(cell(page, 'Ali Kaya', '2026-10-04')).toHaveText('H');

  // Fırça: Raporlu, tek tık
  await page.getByRole('toolbar', { name: 'Puantaj fırçası' }).getByRole('button', { name: /Raporlu/ }).click();
  await cell(page, 'Ali Kaya', '2026-10-05').click();
  await expect(cell(page, 'Ali Kaya', '2026-10-05')).toHaveText('R');
  await expect(worked(page, 'Ali Kaya')).toHaveText('26');
  // Aynı fırçayla tekrar tıklama hücreyi temizler
  await cell(page, 'Ali Kaya', '2026-10-05').click();
  await expect(cell(page, 'Ali Kaya', '2026-10-05')).toHaveText('');
  await cell(page, 'Ali Kaya', '2026-10-05').click();

  // Fırça yalnızca tıklamayla işaretler: basılı tutup sürüklemek üzerinden geçilen hücreleri DEĞİŞTİRMEZ
  await page.getByRole('toolbar', { name: 'Puantaj fırçası' }).getByRole('button', { name: /Ücretli izin/ }).click();
  const box = async (d: string) => (await cell(page, 'Veli Demir', d).boundingBox())!;
  const s = await box('2026-10-06');
  const e = await box('2026-10-08');
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width * 1.5, s.y + s.height / 2, { steps: 4 });
  await page.mouse.move(e.x + e.width / 2, e.y + e.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(cell(page, 'Veli Demir', '2026-10-06')).toHaveText('İ');
  for (const d of ['2026-10-07', '2026-10-08']) await expect(cell(page, 'Veli Demir', d)).toHaveText('8');
  await expect(worked(page, 'Veli Demir')).toHaveText('26');
  // Diğer günler tek tek tıklanarak işaretlenir
  for (const d of ['2026-10-07', '2026-10-08']) await cell(page, 'Veli Demir', d).click();
  for (const d of ['2026-10-06', '2026-10-07', '2026-10-08']) await expect(cell(page, 'Veli Demir', d)).toHaveText('İ');
  await expect(worked(page, 'Veli Demir')).toHaveText('24');

  // Yarım gün ve gün sütununa toplu uygulama (Devamsız, 20 Ekim)
  await page.getByRole('toolbar', { name: 'Puantaj fırçası' }).getByRole('button', { name: /Yarım gün/ }).click();
  await cell(page, 'Can Öz', '2026-10-09').click();
  await expect(worked(page, 'Can Öz')).toHaveText('26,5');
  await page.getByRole('toolbar', { name: 'Puantaj fırçası' }).getByRole('button', { name: /Devamsız/ }).click();
  await page.locator('th[data-day="2026-10-20"]').click();
  for (const n of ['Ali Kaya', 'Veli Demir', 'Can Öz']) await expect(cell(page, n, '2026-10-20')).toHaveText('0'); // Devamsız = 0

  // Fırçaları düzenle: "Ücretsiz izin" yazısını "ÜZ" yap, yeni "Gece" fırçası ekle ve kullan
  await page.getByRole('button', { name: 'Fırçaları düzenle' }).click();
  const be = page.getByRole('dialog', { name: 'Puantaj fırçaları' });
  await expect(be.locator('tr[data-brush]')).toHaveCount(8);
  await be.locator('tr[data-brush="Ücretsiz izin"]').getByLabel('Hücre yazısı').fill('ÜZ');
  await be.getByRole('button', { name: 'Yeni fırça ekle' }).click();
  const nr = be.locator('tbody tr').last();
  await nr.getByLabel('Hücre yazısı').fill('G');
  await nr.getByLabel('Fırça adı').fill('Gece vardiyası');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, '21-firca-duzenle.png') });
  await be.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('2 fırça kaydedildi.')).toBeVisible();
  const brushBar0 = page.getByRole('toolbar', { name: 'Puantaj fırçası' });
  await expect(brushBar0).toContainText('ÜZ');
  await brushBar0.getByRole('button', { name: /Gece vardiyası/ }).click();
  await cell(page, 'Can Öz', '2026-10-22').click();
  await expect(cell(page, 'Can Öz', '2026-10-22')).toHaveText('G');
  // Gece vardiyası da tam gün sayılır: Can'in çalışılan günü değişmez
  await expect(worked(page, 'Can Öz')).toHaveText('25,5');

  // Mesai fırçası: hücreye tıkla -> o kişiye mesai
  const brushBar = page.getByRole('toolbar', { name: 'Puantaj fırçası' });
  await brushBar.getByRole('button', { name: /Mesai ekle/ }).click();
  await cell(page, 'Ali Kaya', '2026-10-09').click();
  let m = page.getByRole('dialog', { name: /Mesai — Ali Kaya · 09.10.2026/ });
  await expect(m).toContainText('Bu gün için mesai kaydı yok.');
  await m.locator('input[name=cellStart]').fill('18:00');
  await m.locator('input[name=cellEnd]').fill('21:00');
  await expect(m.locator('input[name=cellRate]')).toHaveValue('100,00');
  await expect(m.getByTestId('cell-ot-preview')).toContainText('300,00 ₺');
  await m.getByRole('button', { name: 'Mesaiyi ekle' }).click();
  await expect(m.getByRole('table', { name: 'Hücre mesaileri' })).toContainText('18:00–21:00');
  await m.getByRole('button', { name: 'Kapat' }).last().click();
  await expect(cell(page, 'Ali Kaya', '2026-10-09').locator('[data-ot]')).toHaveText('3');
  await expect(cell(page, 'Ali Kaya', '2026-10-09')).toContainText('8'); // durum korunur (Çalıştı = 8)
  await expect(page.locator('tr[data-employee="Ali Kaya"] [data-testid=ot-hours]')).toHaveText('3');
  await expect(page.locator('tr[data-employee="Ali Kaya"] [data-testid=ot-amount]')).toHaveText('300,00 ₺');

  // Gün numarasına tıkla -> listedeki herkese toplu mesai
  await page.locator('th[data-day="2026-10-21"]').click();
  const bulk = page.getByRole('dialog', { name: 'Toplu mesai ekle' });
  await expect(bulk.locator('input[name=bulkDate]')).toHaveValue('2026-10-21');
  await bulk.locator('input[name=bulkStart]').fill('18:00');
  await bulk.locator('input[name=bulkEnd]').fill('20:00');
  await expect(bulk.getByTestId('bulk-preview')).toContainText('600,00 ₺'); // 3 kişi × 2 sa × 100 ₺
  await bulk.getByRole('button', { name: '3 çalışana mesai ekle' }).click();
  await page.getByRole('dialog', { name: 'Toplu mesai' }).getByRole('button', { name: 'Evet, ekle' }).click();
  await expect(bulk).toBeHidden();
  for (const n of ['Ali Kaya', 'Veli Demir', 'Can Öz']) await expect(cell(page, n, '2026-10-21').locator('[data-ot]')).toHaveText('2');
  await expect(page.locator('tr[data-employee="Ali Kaya"] [data-testid=ot-hours]')).toHaveText('5');
  // Maaş sütunları — Ali: 30 − R(5 Ekim) − D(20 Ekim) = 28 ücretli gün
  //   işaretli 31 gün − R − D = 29 ücretli gün (ay hesabı yapılmaz)
  //   normal 1.000 × 29 = 29.000; mesai 500 → toplam 29.500; asgari 730 × 29 = 21.170; elden 8.330
  const ali = page.locator('tr[data-employee="Ali Kaya"]');
  await expect(ali.getByTestId('paid-days')).toHaveText('29');
  await expect(ali.getByTestId('pay-total')).toHaveText('29.500,00 ₺');
  await expect(ali.getByTestId('pay-official')).toHaveText('21.170,00 ₺');
  await expect(ali.getByTestId('pay-cash')).toHaveText('8.330,00 ₺');
  if (SHOTS) {
    await page.locator('[aria-label="Puantaj tablosu"]').evaluate((t) => t.parentElement!.scrollTo({ left: 10_000 }));
    await page.screenshot({ path: path.join(SHOTS, '18-puantaj-maas.png') });
    await page.locator('[aria-label="Puantaj tablosu"]').evaluate((t) => t.parentElement!.scrollTo({ left: 0 }));
    await page.screenshot({ path: path.join(SHOTS, '17-puantaj.png') });
  }

  // --- Bordro: aynı değerler, kaydetme, Giderlere maaş ödemesi
  await nav(page, 'Bordro');
  for (let i = 0; i < Math.abs(diff); i++) await page.getByRole('button', { name: diff > 0 ? 'Sonraki ay' : 'Önceki ay' }).click();
  await expect(page.getByTestId('payroll-month')).toHaveText('Ekim 2026');
  const bAli = page.locator('tr[data-employee="Ali Kaya"]');
  await expect(bAli.getByTestId('paid-days')).toHaveText('29');
  await expect(bAli.getByTestId('normal')).toHaveText('29.000,00 ₺');
  await expect(bAli.getByTestId('overtime')).toHaveText('500,00 ₺');
  await expect(bAli.getByTestId('total')).toHaveText('29.500,00 ₺');
  await expect(bAli.getByTestId('official')).toHaveText('21.170,00 ₺');
  await expect(bAli.getByTestId('cash')).toHaveText('8.330,00 ₺');
  // Mert (Merkez Atölye) puantajı yok -> 0
  await expect(page.locator('tr[data-employee="Mert Usta"]')).toContainText('puantaj yok');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, '19-bordro.png') });
  await page.getByLabel('Hepsini seç').uncheck();
  await page.getByLabel('Ali Kaya seç').check();
  await page.getByRole('button', { name: 'Seçilenleri bordroya kaydet (1)' }).click();
  await page.getByRole('dialog', { name: 'Bordroya kaydet' }).getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('1 çalışanın bordrosu kaydedildi (toplam 29.500,00 ₺).')).toBeVisible();
  await expect(bAli).toContainText('Ödendi');
  const bxlsx = path.join(outDir, 'bordro.xlsx');
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog;
  }, bxlsx);
  await page.getByRole('button', { name: 'Excel indir' }).click();
  await expect.poll(() => fs.existsSync(bxlsx)).toBe(true);
  const bw = new ExcelJS.Workbook();
  await bw.xlsx.readFile(bxlsx);
  const bs = bw.getWorksheet('Bordro')!;
  const aliRow = [5, 6, 7, 8].find((r) => bs.getCell(r, 2).value === 'Ali Kaya')!;
  expect([12, 13, 14, 15].map((c) => bs.getCell(aliRow, c).value)).toEqual([29500, 21170, 8330, 'Ödendi']);
  if (SHOTS) fs.copyFileSync(bxlsx, path.join(SHOTS, 'ornek-bordro.xlsx'));
  const bpdf = path.join(outDir, 'bordro.pdf');
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog;
  }, bpdf);
  await page.getByRole('button', { name: 'PDF indir' }).click();
  await expect.poll(() => fs.existsSync(bpdf) && fs.readFileSync(bpdf).subarray(0, 4).toString()).toBe('%PDF');
  if (SHOTS) fs.copyFileSync(bpdf, path.join(SHOTS, 'ornek-bordro.pdf'));
  await nav(page, 'Giderler');
  await page.getByRole('button', { name: 'Tümü' }).click();
  await expect(page.getByRole('table', { name: 'Giderler' })).toContainText('Maaş - Ali Kaya (Ekim 2026)');
  await expect(page.getByRole('table', { name: 'Giderler' })).toContainText('29.000,00 ₺');
  await expect(page.getByRole('table', { name: 'Giderler' })).toContainText('Mesai - Ali Kaya (Ekim 2026)');
  await nav(page, 'Puantaj');
  for (let i = 0; i < Math.abs(diff); i++) await page.getByRole('button', { name: diff > 0 ? 'Sonraki ay' : 'Önceki ay' }).click();
  await page.getByLabel('Firma / şantiye filtresi').selectOption({ label: 'Ataşehir Konutları' });

  // Sayfadan çıkıp gir: kaydedilmiş olmalı
  await nav(page, 'Ana Sayfa');
  await nav(page, 'Puantaj');
  for (let i = 0; i < Math.abs(diff); i++) await page.getByRole('button', { name: diff > 0 ? 'Sonraki ay' : 'Önceki ay' }).click();
  await expect(cell(page, 'Veli Demir', '2026-10-07')).toHaveText('İ');
  await expect(worked(page, 'Ali Kaya')).toHaveText('25');
  await expect(worked(page, 'Can Öz')).toHaveText('25,5');

  // Excel: tek şantiye -> tek sayfa; bütün şantiyeler -> her şantiye ayrı sayfa
  await page.getByLabel('Firma / şantiye filtresi').selectOption({ label: 'Ataşehir Konutları' });
  await expect(page.locator('tr[data-employee]')).toHaveCount(3);
  const xlsx = path.join(outDir, 'puantaj.xlsx');
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog;
  }, xlsx);
  await page.getByRole('button', { name: 'Excel indir' }).click();
  await expect(page.getByText(/Puantaj kaydedildi/)).toBeVisible();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsx);
  expect(wb.worksheets.map((w) => w.name)).toEqual(['Ataşehir Konutları']);
  await page.getByLabel('Firma / şantiye filtresi').selectOption('');
  await page.getByRole('button', { name: 'Excel indir' }).click();
  await expect.poll(async () => {
    const w = new ExcelJS.Workbook();
    await w.xlsx.readFile(xlsx);
    return w.worksheets.map((x) => x.name);
  }).toEqual(['Ataşehir Konutları', 'Merkez Atölye']);
  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.readFile(xlsx);
  const ws = wb2.getWorksheet('Ataşehir Konutları')!;
  const veli = [6, 8, 10].find((r) => ws.getCell(r, 3).value === 'Veli Demir')!;
  expect(ws.getCell(veli, 5 + 7).value).toBe('İ');
  expect(ws.getCell(veli, 5 + 31 + 1).value).toBe(23);
  expect(ws.getCell(veli + 1, 5 + 21).value).toBe(2); // Veli'nin mesai satırında 21 Ekim = 2 saat
  const aliX = [6, 8, 10].find((r) => ws.getCell(r, 3).value === 'Ali Kaya')!;
  const headers = (ws.getRow(4).values as unknown[]).map(String);
  expect(headers).toContain('Gece vardiyası (G)'); // eklenen fırça Excel'de de sütun olur
  expect(ws.getCell(aliX, headers.indexOf('Mesai (saat)')).value).toBe(5);
  expect(ws.getCell(aliX, headers.indexOf('Mesai parası (₺)')).value).toBe(500);
  expect(ws.getCell(aliX, headers.indexOf('TOPLAM (₺)')).value).toBe(29500);

  // PDF
  const pdf = path.join(outDir, 'puantaj.pdf');
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dialog.showSaveDialog;
  }, pdf);
  await page.getByRole('button', { name: 'PDF indir' }).click();
  await expect.poll(() => fs.existsSync(pdf) && fs.readFileSync(pdf).subarray(0, 4).toString()).toBe('%PDF');
  if (SHOTS) fs.copyFileSync(pdf, path.join(SHOTS, 'ornek-puantaj.pdf'));
  if (SHOTS) fs.copyFileSync(xlsx, path.join(SHOTS, 'ornek-puantaj.xlsx'));

  // Raporlar (Ekim 2026): maliyet puantajdan, gider kaydedilen bordrodan
  //   Maliyet: Ali 29.000 + Can 29.500 + Veli 30.000 = 88.500 personel + 900 mesai = 89.400
  //   Gider: yalnızca Ali'nin bordrosu kaydedildi → maaş 29.000 + mesai 500 = 29.500 → fark 59.900
  await nav(page, 'Raporlar');
  await page.getByRole('button', { name: 'Aylık' }).click();
  await page.locator('input[type=month]').fill('2026-10');
  await expect(page.getByTestId('cost-labor')).toHaveText('88.500,00 ₺');
  await expect(page.getByTestId('cost-total')).toHaveText('89.400,00 ₺');
  await expect(page.getByTestId('exp-salary')).toHaveText('29.000,00 ₺');
  await expect(page.getByTestId('exp-overtime')).toHaveText('500,00 ₺');
  await expect(page.getByTestId('exp-total')).toHaveText('29.500,00 ₺');
  await expect(page.getByTestId('diff')).toHaveText('59.900,00 ₺');
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, '23-rapor-maliyet-gider.png') });

  // Ana sayfa: bugünkü puantaj, bordro özeti, ödenmemiş giderler
  await nav(page, 'Ana Sayfa');
  await expect(page.getByTestId('today-attendance')).toBeVisible();
  await expect(page.getByTestId('month-payroll')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, '20-ana-sayfa.png') });

  await app.close();
});

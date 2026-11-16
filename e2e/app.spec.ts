// Uçtan uca test: gerçek Electron uygulamasını açar, arayüz üzerinden kayıt ekler,
// hesaplamaları, dışa aktarmayı, yedeklemeyi ve yeniden açılınca verilerin korunmasını doğrular.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eromec-e2e-'));
const OUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'eromec-e2e-out-'));
const SHOTS = process.env.EROMEC_SHOTS_DIR;

const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const TODAY_TR = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;

async function launch(): Promise<{ app: ElectronApplication; page: Page; external: string[] }> {
  const app = await electron.launch({
    args: [ROOT, '--no-sandbox'],
    env: { ...process.env, EROMEC_DATA_DIR: DATA_DIR, VITE_DEV_SERVER_URL: '' },
  });
  const page = await app.firstWindow();
  const external: string[] = [];
  page.on('request', (r) => {
    if (!/^(file|data|devtools|blob):/.test(r.url())) external.push(r.url());
  });
  await page.setViewportSize({ width: 1366, height: 820 });
  await expect(page.getByTestId('app-name')).toHaveText('Puanto');
  return { app, page, external };
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Ana menü' }).getByRole('button', { name: label }).click();
const dialog = (page: Page, title: string) => page.getByRole('dialog', { name: title });

test('Puanto uçtan uca senaryo', async () => {
  let { app, page, external } = await launch();

  // --- Ana sayfa: boş veritabanı, sahte veri yok
  await expect(page.getByRole('heading', { name: 'Ana Sayfa' })).toBeVisible();
  const cards = page.getByTestId('dashboard-cards');
  await expect(cards).toContainText('Toplam çalışan0');
  await expect(cards).toContainText('Bu ayki maliyet0,00 ₺');
  await expect(page.getByText('Henüz bir işlem yapılmadı')).toBeVisible();

  // --- Bütün menü öğeleri çalışıyor
  for (const [menu, heading] of [['Çalışanlar', 'Çalışanlar'], ['Mesailer', 'Mesailer'], ['Giderler', 'Giderler'], ['Raporlar', 'Raporlar'], ['Ayarlar', 'Ayarlar']]) {
    await nav(page, menu);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }

  // --- Çalışan ekleme ve doğrulama
  await nav(page, 'Çalışanlar');
  await expect(page.getByText('Henüz çalışan eklenmedi')).toBeVisible();
  await page.getByRole('button', { name: 'Yeni çalışan' }).click();
  let d = dialog(page, 'Yeni çalışan');
  await d.getByRole('button', { name: 'Kaydet' }).click();
  await expect(d.getByText('Ad soyad zorunludur.')).toBeVisible();
  await expect(d.getByText('Görev zorunludur.')).toBeVisible();
  await d.locator('input[name=fullName]').fill('Ahmet Yılmaz');
  await d.locator('input[name=position]').fill('Usta');
  await d.locator('input[name=salary]').fill('abc');
  await d.getByRole('button', { name: 'Kaydet' }).click();
  await expect(d.getByText(/Geçerli bir tutar girin/)).toBeVisible();
  await d.locator('input[name=salary]').fill('30.000');
  await d.locator('input[name=rate]').fill('200');
  await d.locator('input[name=startDate]').fill('2024-03-01');
  await d.getByRole('button', { name: 'Kaydet' }).click();
  await expect(d).toBeHidden();
  const empTable = page.getByRole('table', { name: 'Çalışanlar' });
  await expect(empTable).toContainText('P0001');
  await expect(empTable).toContainText('30.000,00 ₺');
  await expect(empTable).toContainText('01.03.2024');

  await page.getByRole('button', { name: 'Yeni çalışan' }).click();
  d = dialog(page, 'Yeni çalışan');
  await d.locator('input[name=fullName]').fill('Şükrü Öztürk');
  await d.locator('input[name=position]').fill('Kaynakçı');
  await d.locator('input[name=rate]').fill('150,50');
  await d.getByRole('button', { name: 'Kaydet' }).click();
  await expect(empTable).toContainText('Şükrü Öztürk');

  // Aynı isimle ikinci kayıt -> uyarı, vazgeçince eklenmez
  await page.getByRole('button', { name: 'Yeni çalışan' }).click();
  d = dialog(page, 'Yeni çalışan');
  await d.locator('input[name=fullName]').fill('Ahmet Yılmaz');
  await d.locator('input[name=position]').fill('Usta');
  await d.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText(/adında aktif bir çalışan zaten var/)).toBeVisible();
  await dialog(page, 'Benzer kayıt var').getByRole('button', { name: 'Vazgeç' }).click();
  await d.getByRole('button', { name: 'Vazgeç' }).click();
  await expect(empTable.locator('tbody tr')).toHaveCount(2);

  // Hücreye tıklayarak düzenleme (görev)
  await empTable.getByRole('cell', { name: 'Kaynakçı' }).click();
  const cellInput = empTable.getByRole('textbox', { name: 'Görev' });
  await cellInput.fill('Kaynak Ustası');
  await cellInput.press('Enter');
  await expect(empTable).toContainText('Kaynak Ustası');
  await shot(page, '02-calisanlar');

  // --- Mesai: gece yarısını aşan kayıt, ücret çalışandan gelir
  await nav(page, 'Mesailer');
  await page.getByRole('button', { name: 'Yeni mesai' }).click();
  d = dialog(page, 'Yeni mesai');
  await d.locator('select[name=employee]').selectOption({ label: 'Ahmet Yılmaz — Usta' });
  await expect(d.locator('input[name=rate]')).toHaveValue('200,00');
  await d.locator('input[name=startTime]').fill('22:00');
  await d.locator('input[name=endTime]').fill('01:30');
  await d.locator('input[name=breakMinutes]').fill('30');
  await expect(d.getByTestId('overtime-preview')).toContainText('3 sa');
  await expect(d.getByTestId('overtime-preview')).toContainText('gece yarısını aşıyor');
  await expect(d.getByTestId('overtime-preview')).toContainText('600,00 ₺');
  await d.getByRole('button', { name: 'Kaydet' }).click();
  await expect(d).toBeHidden();
  const otTable = page.getByRole('table', { name: 'Mesailer' });
  await expect(otTable).toContainText('600,00 ₺');
  await expect(otTable).toContainText('3,00');

  // Negatif/hatalı süre engellenir
  await page.getByRole('button', { name: 'Yeni mesai' }).click();
  d = dialog(page, 'Yeni mesai');
  await d.locator('select[name=employee]').selectOption({ label: 'Şükrü Öztürk — Kaynak Ustası' });
  await d.locator('input[name=startTime]').fill('18:00');
  await d.locator('input[name=endTime]').fill('19:00');
  await d.locator('input[name=breakMinutes]').fill('90');
  await expect(d.getByTestId('overtime-preview')).toContainText('Mola süresi toplam çalışma süresinden kısa olmalıdır.');
  await d.getByRole('button', { name: 'Kaydet' }).click();
  await expect(d.getByRole('alert')).toContainText('Mola');
  await d.locator('input[name=breakMinutes]').fill('0');
  await d.locator('input[name=endTime]').fill('20:00');
  await d.getByRole('button', { name: 'Kaydet' }).click();
  await expect(d).toBeHidden();
  await expect(otTable).toContainText('301,00 ₺'); // 2 saat × 150,50
  await expect(page.getByTestId('overtime-totals')).toContainText('Bu ay');
  await expect(page.getByTestId('overtime-totals')).toContainText('901,00 ₺');
  await shot(page, '03-mesailer');

  // --- Giderler
  await nav(page, 'Giderler');
  const addExpense = async (name: string, category: string, amount: string, paid: boolean) => {
    await page.getByRole('button', { name: 'Yeni gider' }).click();
    const g = dialog(page, 'Yeni gider');
    await g.locator('input[name=amount]').fill(amount);
    await g.locator('select[name=category]').selectOption({ label: category });
    await g.locator('select[name=paid]').selectOption(paid ? '1' : '0');
    await g.locator('input[name=name]').fill(name);
    await g.getByRole('button', { name: 'Kaydet' }).click();
    return g;
  };
  await expect(await addExpense('Öğle yemeği', 'Yemek', '450,50', true)).toBeHidden();
  await expect(await addExpense('Dükkan kirası', 'Diğer', '15.000', false)).toBeHidden();
  await expect(await addExpense('Fren balatası', 'Yedek parça ve malzeme', '1250,25', false)).toBeHidden();
  // Ek mesai kategorisinde ödeme takibi (toplama dahil edilmemeli)
  const g = await addExpense('Ahmet mesai ödemesi', 'Ek mesai', '600', true);
  await expect(g).toBeHidden();
  // Aynı gider ikinci kez -> uyarı
  const dup = await addExpense('Öğle yemeği', 'Yemek', '450,50', true);
  await expect(page.getByText(/aynı ad, kategori ve tutarla/)).toBeVisible();
  await dialog(page, 'Aynı gider zaten var').getByRole('button', { name: 'Vazgeç' }).click();
  await dup.getByRole('button', { name: 'Vazgeç' }).click();

  const exTable = page.getByRole('table', { name: 'Giderler' });
  await expect(exTable.locator('tbody tr')).toHaveCount(4);
  await expect(page.getByTestId('expense-total')).toHaveText('17.300,75 ₺');

  // Maaş ödemesi: aynı ay iki kez kaydedilemez
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Maaş ödemesi kaydet' }).click();
    const s = dialog(page, 'Maaş ödemesi kaydet');
    await s.getByRole('button', { name: 'Kaydet' }).click();
    if (i === 0) await expect(s).toBeHidden();
    else {
      await expect(s.getByRole('alert')).toContainText('zaten kaydedilmiş');
      await s.getByRole('button', { name: 'Vazgeç' }).click();
    }
  }
  await expect(exTable).toContainText('Maaş - Ahmet Yılmaz');
  await expect(page.getByTestId('expense-total')).toHaveText('47.300,75 ₺');

  // Filtreler ve arama
  await page.getByLabel('Ödeme durumu filtresi').selectOption('unpaid');
  await expect(page.getByTestId('expense-total')).toHaveText('16.250,25 ₺');
  await page.getByLabel('Ödeme durumu filtresi').selectOption('');
  await page.getByLabel('Kategori filtresi').selectOption({ label: 'Yemek' });
  await expect(exTable.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Kategori filtresi').selectOption('0');
  await page.getByLabel('Gider ara').fill('BALATA');
  await expect(exTable.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Gider ara').fill('');
  await expect(exTable.locator('tbody tr')).toHaveCount(5);

  // Hücrede tutar düzenleme ve ödeme durumu değiştirme
  await exTable.locator('tbody').getByRole('cell', { name: '1.250,25 ₺' }).click();
  const amt = exTable.getByRole('textbox', { name: 'Tutar' });
  await amt.fill('1300');
  await amt.press('Enter');
  await expect(exTable).toContainText('1.300,00 ₺');
  const balataRow = exTable.locator('tr', { hasText: 'Fren balatası' });
  await balataRow.getByText('Ödenmedi').click();
  await balataRow.getByRole('combobox', { name: 'Ödeme durumu' }).selectOption('1');
  await expect(balataRow).toContainText('Ödendi');

  // Silme onaylı
  const yemekRow = exTable.locator('tr', { hasText: 'Öğle yemeği' });
  await yemekRow.getByRole('button', { name: 'Sil' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Vazgeç' }).click();
  await expect(yemekRow).toBeVisible();
  await yemekRow.getByRole('button', { name: 'Sil' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
  await expect(exTable.locator('tbody tr')).toHaveCount(4);
  await shot(page, '04-giderler');

  // --- Raporlar (bu ay): maaş 30.000 + mesai 901 + diğer 16.300 = 47.201
  await nav(page, 'Raporlar');
  await page.getByRole('button', { name: 'Aylık' }).click();
  // Solda MALİYET (yapılan iş), sağda GİDER (kaydedilen ödemeler)
  //   Maliyet: puantaj yok (0) + mesai 901 + diğer 16.300 = 17.201
  //   Gider: maaş ödemesi 30.000 + mesai ödemesi 600 + diğer 16.300 = 46.900 (ödenen 31.900, borç 15.000)
  const val = (id: string) => page.getByTestId(id);
  await expect(page.getByRole('table', { name: 'Maliyet' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Gider' })).toBeVisible();
  await expect(val('cost-labor')).toHaveText('0,00 ₺');
  await expect(val('cost-overtime')).toHaveText('901,00 ₺');
  await expect(val('cost-other')).toHaveText('16.300,00 ₺');
  await expect(val('cost-total')).toHaveText('17.201,00 ₺');
  await expect(val('exp-salary')).toHaveText('30.000,00 ₺');
  await expect(val('exp-overtime')).toHaveText('600,00 ₺');
  await expect(val('exp-other')).toHaveText('16.300,00 ₺');
  await expect(val('exp-total')).toHaveText('46.900,00 ₺');
  await expect(val('exp-paid')).toHaveText('31.900,00 ₺');
  await expect(val('exp-unpaid')).toHaveText('15.000,00 ₺');
  await expect(val('diff')).toHaveText('-29.699,00 ₺');
  await shot(page, '05-raporlar');

  // CSV ve PDF dışa aktarma (kaydetme penceresi testte otomatik yanıtlanır)
  const csvPath = path.join(OUT_DIR, 'rapor.csv');
  const pdfPath = path.join(OUT_DIR, 'rapor.pdf');
  await app.evaluate(({ dialog: dlg }, p) => {
    dlg.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dlg.showSaveDialog;
  }, csvPath);
  // Önce "Rapora girecek giderler" penceresi açılır; varsayılan olarak hepsi seçilidir
  await page.getByRole('button', { name: 'Excel / CSV olarak kaydet' }).click();
  const picker = page.getByRole('dialog', { name: 'Rapora girecek giderler' });
  await expect(picker.getByTestId('picker-total')).toHaveText('46.900,00 ₺');
  await picker.getByTestId('picker-confirm').click();
  await expect(page.getByText('Rapor kaydedildi').first()).toBeVisible();
  const csv = fs.readFileSync(csvPath, 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('TOPLAM MALİYET;17201,00');
  expect(csv).toContain('TOPLAM GİDER;46900,00');
  expect(csv).toContain('Şükrü Öztürk');

  // Hiçbir gider seçilmezse raporda gider listesi boş, gider toplamı 0 olur; diğer giderler maliyetten de düşer
  const csvNone = path.join(OUT_DIR, 'rapor-gidersiz.csv');
  await app.evaluate(({ dialog: dlg }, p) => {
    dlg.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dlg.showSaveDialog;
  }, csvNone);
  await page.getByRole('button', { name: 'Excel / CSV olarak kaydet' }).click();
  await picker.getByRole('button', { name: 'Hiçbirini seçme' }).click();
  await expect(picker.getByTestId('picker-count')).toHaveText('0');
  await picker.getByTestId('picker-confirm').click();
  await expect.poll(() => fs.existsSync(csvNone)).toBe(true);
  const csv2 = fs.readFileSync(csvNone, 'utf8');
  expect(csv2).toContain('TOPLAM GİDER;0,00');
  expect(csv2).toContain('TOPLAM MALİYET;901,00');

  await app.evaluate(({ dialog: dlg }, p) => {
    dlg.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dlg.showSaveDialog;
  }, pdfPath);
  await page.getByRole('button', { name: 'PDF olarak kaydet' }).click();
  await picker.getByTestId('picker-confirm').click();
  await expect.poll(() => fs.existsSync(pdfPath) && fs.readFileSync(pdfPath).subarray(0, 4).toString()).toBe('%PDF');

  // --- Ana sayfa gerçek kayıtlardan hesaplanır
  await nav(page, 'Ana Sayfa');
  await expect(cards).toContainText('Toplam çalışan2');
  await expect(page.getByRole('list', { name: 'Son işlemler' })).toContainText('Gider silindi: Öğle yemeği');
  await shot(page, '01-ana-sayfa');

  // --- Ayarlar: şirket adı ve yedek
  await nav(page, 'Ayarlar');
  await page.locator('input[name=companyName]').fill('Eroğlu Mekanik Ltd. Şti.');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Ayarlar kaydedildi.')).toBeVisible();
  await expect(page.locator('aside')).toContainText('Eroğlu Mekanik Ltd. Şti.');
  const backupPath = path.join(OUT_DIR, 'yedek.db');
  await app.evaluate(({ dialog: dlg }, p) => {
    dlg.showSaveDialog = (async () => ({ canceled: false, filePath: p })) as typeof dlg.showSaveDialog;
  }, backupPath);
  await page.getByRole('button', { name: 'Yedek al' }).click();
  await expect(page.getByText('Yedek kaydedildi')).toBeVisible();
  expect(fs.readFileSync(backupPath).subarray(0, 15).toString()).toBe('SQLite format 3');
  // Gider kategorileri: Kira ve Elektrik ve su yok; ekleme, silme, giderleri taşıyarak silme
  const catTable = page.getByRole('table', { name: 'Gider kategorileri' });
  await expect(catTable).not.toContainText('Kira');
  await expect(catTable).not.toContainText('Elektrik ve su');
  await expect(catTable.locator('tr[data-category="Personel maaşı"]').getByRole('button', { name: 'Sil' })).toHaveCount(0);
  await page.getByLabel('Yeni kategori adı').fill('Kırtasiye');
  await page.getByRole('button', { name: 'Kategori ekle' }).click();
  await expect(catTable.locator('tr[data-category="Kırtasiye"]')).toBeVisible();
  await catTable.locator('tr[data-category="Yol ve ulaşım"]').getByRole('button', { name: 'Sil' }).click();
  await page.getByRole('dialog', { name: 'Kategoriyi sil' }).getByRole('button', { name: 'Sil' }).click();
  await expect(catTable.locator('tr[data-category="Yol ve ulaşım"]')).toHaveCount(0);
  // "Yedek parça ve malzeme" kategorisinde Fren balatası gideri var -> taşı ve sil
  await catTable.locator('tr[data-category="Yedek parça ve malzeme"]').getByRole('button', { name: 'Sil' }).click();
  const mv = page.getByRole('dialog', { name: /Yedek parça ve malzeme/ });
  await mv.locator('select[name=moveTo]').selectOption({ label: 'Diğer (Genel gider)' });
  await mv.getByRole('button', { name: 'Taşı ve sil' }).click();
  await expect(catTable.locator('tr[data-category="Yedek parça ve malzeme"]')).toHaveCount(0);
  await expect(catTable.locator('tr[data-category="Diğer"]')).toContainText('2 gider');
  await shot(page, '06-ayarlar');

  // Gece modu: yalnızca Ayarlar'daki "Görünüm" seçiminden açılır
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect(page.getByTestId('theme-toggle')).toHaveCount(0);
  await page.locator('select[name=theme]').selectOption('dark');
  await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bodyBg).toBe('rgb(16, 16, 16)');

  // Çevrim dışı: uygulama hiçbir dış adrese istek yapmadı; dış istekler engellenir
  expect(external).toEqual([]);
  const fetchResult = await page.evaluate(async () => {
    try {
      await fetch('https://example.com');
      return 'erişildi';
    } catch {
      return 'engellendi';
    }
  });
  expect(fetchResult).toBe('engellendi');
  // Renderer içinde Node.js erişimi yok
  expect(await page.evaluate(() => typeof (globalThis as { require?: unknown }).require)).toBe('undefined');
  expect(await page.evaluate(() => typeof (globalThis as { process?: unknown }).process)).toBe('undefined');

  // --- Kapat, yeniden aç: veriler korunur
  await app.close();
  ({ app, page, external } = await launch());
  await expect(page.locator('aside')).toContainText('Eroğlu Mekanik Ltd. Şti.');
  await expect(page.getByTestId('dashboard-cards')).toContainText('Toplam çalışan2');
  // Gece modu tercihi yeniden açılışta korunur
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect
    .poll(() => page.getByRole('button', { name: 'Gider ekle' }).evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(26, 26, 26)');
  await shot(page, '08-gece-ana-sayfa');
  await nav(page, 'Giderler');
  await expect(page.getByRole('table', { name: 'Giderler' }).locator('tbody tr')).toHaveCount(4);
  await nav(page, 'Mesailer');
  await expect(page.getByRole('table', { name: 'Mesailer' }).locator('tbody tr')).toHaveCount(2);
  await shot(page, '09-gece-mesailer');
  await nav(page, 'Giderler');
  await page.getByRole('button', { name: 'Yeni gider' }).click();
  await shot(page, '10-gece-gider-formu');
  await dialog(page, 'Yeni gider').getByRole('button', { name: 'Vazgeç' }).click();

  // --- Çalışan silme: kaydı olduğu için silinmez, "Ayrıldı" yapılır
  await nav(page, 'Çalışanlar');
  const row = page.getByRole('table', { name: 'Çalışanlar' }).locator('tr', { hasText: 'Ahmet Yılmaz' });
  await row.getByRole('button', { name: 'Sil' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
  await expect(page.getByText(/Geçmiş kayıtların kaybolmaması için çalışan silinemez/)).toBeVisible();
  await page.getByRole('button', { name: 'Ayrıldı olarak işaretle' }).click();
  await expect(page.getByRole('table', { name: 'Çalışanlar' })).not.toContainText('Ahmet Yılmaz');
  await page.getByRole('button', { name: /Ayrılmış/ }).click();
  await expect(page.getByRole('table', { name: 'Çalışanlar' })).toContainText('Ahmet Yılmaz');
  await page.getByRole('table', { name: 'Çalışanlar' }).locator('tr', { hasText: 'Ahmet Yılmaz' }).getByRole('button', { name: 'Detay' }).click();
  await expect(page.getByRole('dialog')).toContainText('Kaydedilen maaş ödemeleri');
  await shot(page, '07-calisan-detay');
  await page.getByRole('dialog').getByRole('button', { name: 'Kapat' }).first().click();

  // --- Yedekten geri yükleme (onay penceresi testte "Evet" yanıtlanır)
  await nav(page, 'Giderler');
  await page.getByRole('table', { name: 'Giderler' }).locator('tr', { hasText: 'Dükkan kirası' }).getByRole('button', { name: 'Sil' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
  await expect(page.getByRole('table', { name: 'Giderler' }).locator('tbody tr')).toHaveCount(3);
  await app.evaluate(({ dialog: dlg }, p) => {
    dlg.showOpenDialog = (async () => ({ canceled: false, filePaths: [p] })) as typeof dlg.showOpenDialog;
    dlg.showMessageBox = (async () => ({ response: 1, checkboxChecked: false })) as typeof dlg.showMessageBox;
  }, backupPath);
  await nav(page, 'Ayarlar');
  await page.getByRole('button', { name: 'Yedekten geri yükle' }).click();
  await expect(page.getByText('Yedek geri yüklendi')).toBeVisible();
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('app-name')).toHaveText('Puanto');
  await nav(page, 'Giderler');
  await expect(page.getByRole('table', { name: 'Giderler' })).toContainText('Dükkan kirası');
  expect(fs.readdirSync(path.join(DATA_DIR, 'yedekler')).some((f) => f.startsWith('otomatik-geri-yukleme-oncesi'))).toBe(true);

  expect(external).toEqual([]);
  await app.close();
  console.log('Bugün:', TODAY_TR, '· Veri klasörü:', DATA_DIR);
});

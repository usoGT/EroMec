// Uçtan uca: firmalar/şantiyeler, kimlik-IBAN bilgileri, toplu mesai, takvim ve günlük rapor.
import { _electron as electron, expect, test, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.EROMEC_SHOTS_DIR;
const pad = (n: number) => String(n).padStart(2, '0');
const now = new Date();
const TODAY = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const nav = (page: Page, label: string) => page.getByRole('navigation', { name: 'Ana menü' }).getByRole('button', { name: label }).click();
const dialog = (page: Page, title: string | RegExp) => page.getByRole('dialog', { name: title });
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

test('şantiyeler, toplu mesai, takvim ve günlük rapor', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eromec-e2e-santiye-'));
  const app = await electron.launch({ args: [ROOT, '--no-sandbox'], env: { ...process.env, EROMEC_DATA_DIR: dataDir, VITE_DEV_SERVER_URL: '' } });
  const page = await app.firstWindow();
  await page.setViewportSize({ width: 1366, height: 860 });
  await expect(page.getByTestId('app-name')).toHaveText('Puanto');

  // --- Sol menü: ☰ ile açılır / kapanır
  const aside = page.locator('aside');
  if ((await aside.getAttribute('data-open')) === 'true') await page.getByRole('button', { name: 'Menüyü kapat' }).click();
  await expect(aside).toHaveAttribute('data-open', 'false');
  await expect.poll(async () => (await aside.boundingBox())!.width).toBeLessThan(80);
  await page.getByRole('button', { name: 'Menüyü aç' }).click();
  await expect(aside).toHaveAttribute('data-open', 'true');
  await expect.poll(async () => (await aside.boundingBox())!.width).toBeGreaterThan(200);
  await expect(aside.getByText('Şantiyeler', { exact: true })).toBeVisible();

  // --- Firma ve şantiyeler: ana firma otomatik oluşur
  await nav(page, 'Şantiyeler');
  await expect(page.getByRole('table', { name: 'Firmalar' })).toContainText('Firmam');
  await page.getByRole('button', { name: 'Yeni firma' }).click();
  let d = dialog(page, 'Yeni firma');
  await d.locator('input[name=name]').fill('Yıldız İnşaat A.Ş.');
  await d.locator('input[name=taxNo]').fill('1234567890');
  await d.getByRole('button', { name: 'Kaydet' }).click();
  await expect(d).toBeHidden();
  for (const [company, name] of [['Firmam', 'Merkez Atölye'], ['Yıldız İnşaat A.Ş.', 'Ataşehir Konutları']]) {
    await page.getByRole('button', { name: 'Yeni şantiye' }).click();
    d = dialog(page, 'Yeni şantiye');
    await d.locator('select[name=company]').selectOption({ label: company });
    await d.locator('input[name=name]').fill(name);
    await d.getByRole('button', { name: 'Kaydet' }).click();
    await expect(d).toBeHidden();
  }
  await expect(page.getByRole('table', { name: 'Şantiyeler' }).locator('tbody tr')).toHaveCount(2);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, '22-menu-acik.png') });
  await page.getByRole('button', { name: 'Menüyü kapat' }).click();
  await expect(aside).toHaveAttribute('data-open', 'false');

  // --- Çalışanlar: kimlik ve banka bilgileri, doğrulama
  await nav(page, 'Çalışanlar');
  const addEmployee = async (name: string, rate: string, site: string, tc?: string, iban?: string) => {
    await page.getByRole('button', { name: 'Yeni çalışan' }).click();
    const f = dialog(page, 'Yeni çalışan');
    await f.locator('input[name=fullName]').fill(name);
    await f.locator('input[name=position]').fill('Usta');
    await f.locator('input[name=rate]').fill(rate);
    await f.locator('select[name=site]').selectOption({ label: site });
    if (tc || iban) {
      await f.getByRole('tab', { name: 'Kimlik ve banka' }).click();
      if (tc) await f.locator('input[name=nationalId]').fill(tc);
      if (iban) await f.locator('input[name=iban]').fill(iban);
      await f.locator('input[name=bankName]').fill('Ziraat Bankası');
      await expect(f.locator('select[name=bloodType]')).toHaveCount(0); // kan grubu artık tutulmuyor
    }
    await f.getByRole('button', { name: 'Kaydet' }).click();
    return f;
  };
  // Hatalı T.C. -> kimlik sekmesinde hata
  let f = await addEmployee('Ali Kaya', '200', 'Ataşehir Konutları', '12345678901');
  await expect(f.getByText(/T.C. kimlik numarası geçersiz/)).toBeVisible();
  await shot(page, '11-calisan-kimlik-sekmesi');
  await f.locator('input[name=nationalId]').fill('10000000146');
  await f.locator('input[name=iban]').fill('tr330006100519786457841326');
  await f.getByRole('button', { name: 'Kaydet' }).click();
  await expect(f).toBeHidden();
  await expect(await addEmployee('Veli Demir', '150', 'Ataşehir Konutları')).toBeHidden();
  await expect(await addEmployee('Can Öz', '180', 'Ataşehir Konutları')).toBeHidden();
  await expect(await addEmployee('Mert Atölye', '120', 'Merkez Atölye')).toBeHidden();
  const empTable = page.getByRole('table', { name: 'Çalışanlar' });
  await expect(empTable).toContainText('Ataşehir Konutları');
  await page.getByLabel('Firma / şantiye filtresi').selectOption({ label: 'Ataşehir Konutları' });
  await expect(empTable.locator('tbody tr')).toHaveCount(3);
  await empTable.locator('tr', { hasText: 'Ali Kaya' }).getByRole('button', { name: 'Detay' }).click();
  await expect(page.getByRole('dialog')).toContainText('TR33 0006 1005 1978 6457 8413 26');
  await expect(page.getByRole('dialog')).toContainText('10000000146');
  await page.getByRole('dialog').getByRole('button', { name: 'Kapat' }).first().click();

  // --- Toplu mesai: şantiyedeki herkese tek tıkla
  await nav(page, 'Mesailer');
  await page.getByRole('button', { name: 'Toplu mesai' }).click();
  d = dialog(page, 'Toplu mesai ekle');
  await d.locator('select[name=bulkSite]').selectOption({ label: 'Ataşehir Konutları' });
  await expect(d.getByRole('table', { name: 'Toplu mesai çalışanları' }).locator('tbody tr')).toHaveCount(3);
  await d.locator('input[name=bulkStart]').fill('18:00');
  await d.locator('input[name=bulkEnd]').fill('21:00');
  await d.locator('input[name=bulkDesc]').fill('Beton dökümü');
  // 3 saat × (200 + 150 + 180) = 1.590 ₺
  await expect(d.getByTestId('bulk-preview')).toContainText('1.590,00 ₺');
  await d.getByLabel('Can Öz seç').uncheck();
  await expect(d.getByTestId('bulk-preview')).toContainText('1.050,00 ₺');
  await d.getByLabel('Can Öz seç').check();
  await shot(page, '12-toplu-mesai');
  await d.getByRole('button', { name: '3 çalışana mesai ekle' }).click();
  await dialog(page, 'Toplu mesai').getByRole('button', { name: 'Evet, ekle' }).click();
  await expect(d).toBeHidden();
  await expect(page.getByText('3 çalışana mesai eklendi (1.590,00 ₺).')).toBeVisible();
  const otTable = page.getByRole('table', { name: 'Mesailer' });
  await expect(otTable.locator('tbody tr')).toHaveCount(3);
  // Aynı toplu mesai tekrar -> hepsi atlanır
  await page.getByRole('button', { name: 'Toplu mesai' }).click();
  d = dialog(page, 'Toplu mesai ekle');
  await d.locator('select[name=bulkSite]').selectOption({ label: 'Ataşehir Konutları' });
  await d.locator('input[name=bulkStart]').fill('18:00');
  await d.locator('input[name=bulkEnd]').fill('21:00');
  await d.getByRole('button', { name: '3 çalışana mesai ekle' }).click();
  await dialog(page, 'Toplu mesai').getByRole('button', { name: 'Evet, ekle' }).click();
  await expect(page.getByText('0 çalışana mesai eklendi')).toBeVisible();
  await expect(page.getByText(/Atlananlar: .*zaten mesai kaydı var/)).toBeVisible();
  await expect(otTable.locator('tbody tr')).toHaveCount(3);

  // --- Gider (şantiyeye bağlı)
  await nav(page, 'Giderler');
  await page.getByRole('button', { name: 'Yeni gider' }).click();
  d = dialog(page, 'Yeni gider');
  await d.locator('input[name=amount]').fill('2500');
  await d.locator('select[name=category]').selectOption({ label: 'Yedek parça ve malzeme' });
  await d.locator('select[name=site]').selectOption({ label: 'Ataşehir Konutları' });
  await d.locator('input[name=name]').fill('Çimento');
  await d.getByRole('button', { name: 'Kaydet' }).click();
  await expect(d).toBeHidden();

  // --- Takvim: bugünün hücresi, gün detayı, günlük rapor
  await nav(page, 'Takvim');
  const cell = page.locator(`[data-date="${TODAY}"]`);
  await expect(cell).toContainText('9 sa');
  await expect(cell).toContainText('1.590');
  await expect(cell).toContainText('2.500');
  await shot(page, '13-takvim');
  await cell.click();
  const day = page.getByTestId('day-detail');
  await expect(day).toContainText('Beton dökümü');
  await expect(day).toContainText('Çimento');
  await expect(day).toContainText('Bu gün için yazılmış rapor yok.');
  await page.getByRole('button', { name: 'Günlük rapor yaz' }).click();
  const rf = page.getByTestId('report-form');
  await rf.locator('select[name=reportSite]').selectOption({ label: 'Ataşehir Konutları' });
  await rf.locator('input[name=weather]').fill('Güneşli');
  await rf.locator('textarea[name=workDone]').fill('3. kat beton dökümü tamamlandı.');
  await rf.locator('textarea[name=reportNotes]').fill('Yarın kalıp sökülecek.');
  await rf.getByRole('button', { name: 'Raporu kaydet' }).click();
  await expect(page.getByTestId('daily-report')).toContainText('3. kat beton dökümü tamamlandı.');
  await expect(page.getByTestId('daily-report')).toContainText('Hava: Güneşli');
  await shot(page, '14-gun-detayi');
  await page.getByRole('dialog').getByRole('button', { name: 'Kapat' }).last().click();
  await expect(cell).toContainText('1 rapor');
  // Şantiye filtresi: Merkez Atölye'de o gün kayıt yok
  await page.getByLabel('Firma / şantiye filtresi').selectOption({ label: 'Merkez Atölye' });
  await expect(cell).not.toContainText('rapor');
  await expect(cell).not.toContainText('sa');

  // --- Raporlar: firma bazlı
  await nav(page, 'Raporlar');
  await page.getByRole('button', { name: 'Günlük' }).click();
  await expect(page.getByTestId('cost-total')).toHaveText('4.090,00 ₺');
  await page.getByLabel('Firma / şantiye filtresi').selectOption({ label: 'Firmam — bütün şantiyeler' });
  await expect(page.getByTestId('cost-total')).toHaveText('0,00 ₺');
  await page.getByLabel('Firma / şantiye filtresi').selectOption({ label: 'Yıldız İnşaat A.Ş. — bütün şantiyeler' });
  await expect(page.getByTestId('cost-total')).toHaveText('4.090,00 ₺');
  await shot(page, '15-rapor-firma');

  // --- Şantiye detayı ve silme kuralı
  await nav(page, 'Şantiyeler');
  const sites = page.getByRole('table', { name: 'Şantiyeler' });
  await expect(sites.locator('tr', { hasText: 'Ataşehir Konutları' })).toContainText('3');
  await sites.locator('tr', { hasText: 'Ataşehir Konutları' }).getByRole('button', { name: 'Detay' }).click();
  await expect(page.getByRole('table', { name: 'Şantiye çalışanları' }).locator('tbody tr')).toHaveCount(3);
  await shot(page, '16-santiye-detay');
  await page.getByRole('dialog').getByRole('button', { name: 'Kapat' }).first().click();
  await sites.locator('tr', { hasText: 'Ataşehir Konutları' }).getByRole('button', { name: 'Sil' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sil' }).click();
  await expect(page.getByText(/Geçmiş kayıtların korunması için silinemez/)).toBeVisible();
  await page.getByRole('button', { name: 'Tamamlandı olarak işaretle' }).click();
  await expect(sites.locator('tr', { hasText: 'Ataşehir Konutları' })).toContainText('Tamamlandı');

  await app.close();
});

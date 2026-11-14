// Bordro dışa aktarma: Excel (.xlsx) ve PDF. Kaydedilmiş bordrolarda kilitli değerler, diğerlerinde anlık hesap kullanılır.
import ExcelJS from 'exceljs';
import type { PayrollMonth, PayrollRow } from '../../shared/types';
import { formatPeriod } from '../../shared/dates';
import { formatMoney } from '../../shared/money';
import { formatIban } from '../../shared/identity';
import { formatDays } from '../../shared/attendance';

export interface PayrollExportData {
  payroll: PayrollMonth;
  companyName: string;
  scopeLabel: string;
  currencySymbol: string;
  generatedAt: Date;
}

/** Satırda gösterilecek değerler: kaydedildiyse kilitli kayıt, değilse anlık hesap */
export function payValues(r: PayrollRow) {
  const s = r.saved;
  return s
    ? { paidDays: s.paidHalfDays / 2, monthly: s.monthlySalaryKurus, normal: s.normalKurus, otMin: s.overtimeMinutes, ot: s.overtimeKurus, total: s.totalKurus, official: s.officialKurus, cash: s.cashKurus }
    : { paidDays: r.live.paidDays, monthly: r.live.monthlySalaryKurus, normal: r.live.normalKurus, otMin: r.live.overtimeMinutes, ot: r.live.overtimeKurus, total: r.live.totalKurus, official: r.live.officialKurus, cash: r.live.cashKurus };
}

const hours = (min: number) => Math.round((min / 60) * 100) / 100;

export async function buildPayrollXlsx(d: PayrollExportData): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EroMec';
  const ws = wb.addWorksheet('Bordro', {
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
    views: [{ state: 'frozen', ySplit: 4, xSplit: 2 }],
  });
  const sym = d.currencySymbol;
  const head = ['Sıra', 'Ad Soyad', 'T.C. Kimlik No', 'IBAN', 'Görev', 'Şantiye', `Aylık maaş (${sym})`, 'Ücretli gün',
    `Normal maaş (${sym})`, 'Mesai (saat)', `Mesai parası (${sym})`, `TOPLAM (${sym})`, `Asgari / resmi (${sym})`, `Elden (${sym})`, 'Durum', 'İmza'];
  const last = head.length;
  ws.mergeCells(1, 1, 1, last);
  ws.getCell(1, 1).value = `MAAŞ BORDROSU — ${formatPeriod(d.payroll.month).toLocaleUpperCase('tr-TR')}`;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, last);
  ws.getCell(2, 1).value = `${d.companyName}   ·   Kapsam: ${d.scopeLabel}   ·   Günlük asgari ücret: ${formatMoney(d.payroll.dailyMinWageKurus, sym)}`;
  ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF475569' } };
  const thin = { style: 'thin' as const, color: { argb: 'FFB0B7C3' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const hr = ws.getRow(4);
  head.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, size: 9 };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = border;
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i === 11 ? 'FFBFDBFE' : 'FFE2E8F0' } };
  });
  hr.height = 32;
  const moneyCols = [7, 9, 11, 12, 13, 14];
  const sums = { normal: 0, ot: 0, otMin: 0, total: 0, official: 0, cash: 0, days: 0 };
  d.payroll.rows.forEach((r, i) => {
    const v = payValues(r);
    sums.normal += v.normal; sums.ot += v.ot; sums.otMin += v.otMin; sums.total += v.total; sums.official += v.official; sums.cash += v.cash; sums.days += v.paidDays;
    const row = ws.addRow([
      i + 1, r.fullName + (r.status === 'left' ? ' (ayrıldı)' : ''), r.nationalId, r.iban ? formatIban(r.iban) : '', r.position, r.siteName ?? '',
      v.monthly / 100, v.paidDays, v.normal / 100, hours(v.otMin) || null, v.ot / 100, v.total / 100, v.official / 100, v.cash / 100,
      r.saved ? (r.saved.isPaid ? 'Ödendi' : 'Kaydedildi') : 'Taslak', '',
    ]);
    row.height = 22;
    row.eachCell({ includeEmpty: true }, (c, col) => {
      if (col > last) return;
      c.border = border;
      c.font = { size: 9, bold: col === 12 };
      c.alignment = { vertical: 'middle', horizontal: [2, 4, 5, 6].includes(col) ? 'left' : moneyCols.includes(col) ? 'right' : 'center' };
      if (moneyCols.includes(col)) c.numFmt = '#,##0.00';
      if (col === 12) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    });
    row.getCell(10).numFmt = '0.00';
  });
  const t = ws.addRow(['', `TOPLAM (${d.payroll.rows.length} çalışan)`, '', '', '', '', null, sums.days, sums.normal / 100, hours(sums.otMin), sums.ot / 100, sums.total / 100, sums.official / 100, sums.cash / 100, '', '']);
  t.eachCell({ includeEmpty: true }, (c, col) => {
    if (col > last) return;
    c.border = border;
    c.font = { bold: true, size: 9 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    if (moneyCols.includes(col)) { c.numFmt = '#,##0.00'; c.alignment = { horizontal: 'right' }; }
  });
  ws.addRow([]);
  const note = ws.addRow(['Ücretli gün = 30 − eksik gün (Üİ, R, D ve boş gün = 1; Y = 0,5). Normal maaş = aylık maaş ÷ 30 × ücretli gün. Asgari = günlük asgari ücret × ücretli gün; Elden = Toplam − Asgari.']);
  ws.mergeCells(note.number, 1, note.number, last);
  note.getCell(1).font = { size: 9, color: { argb: 'FF475569' } };
  ws.addRow([]);
  const sign = ws.addRow([]);
  sign.getCell(2).value = 'Hazırlayan: ______________________';
  sign.getCell(8).value = 'Kontrol eden: ______________________';
  sign.getCell(13).value = 'Onaylayan: ______________________';
  [5, 22, 13, 30, 14, 18, 12, 8, 13, 8, 13, 14, 14, 13, 11, 16].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.headerFooter.oddFooter = `&L${d.companyName} — EroMec&RSayfa &P / &N`;
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function buildPayrollHtml(d: PayrollExportData): string {
  const m = (k: number) => esc(formatMoney(k, d.currencySymbol));
  const sums = { normal: 0, ot: 0, total: 0, official: 0, cash: 0, days: 0 };
  const body = d.payroll.rows.map((r, i) => {
    const v = payValues(r);
    sums.normal += v.normal; sums.ot += v.ot; sums.total += v.total; sums.official += v.official; sums.cash += v.cash; sums.days += v.paidDays;
    return `<tr><td>${i + 1}</td><td class="l"><b>${esc(r.fullName)}</b><br><span>${esc(r.position)}${r.siteName ? ` · ${esc(r.siteName)}` : ''}</span></td>
      <td class="l">${esc(r.nationalId)}<br><span>${r.iban ? esc(formatIban(r.iban)) : ''}</span></td>
      <td class="r">${m(v.monthly)}</td><td>${formatDays(v.paidDays)}</td><td class="r">${m(v.normal)}</td>
      <td>${v.otMin ? formatDays(hours(v.otMin)) : ''}</td><td class="r">${m(v.ot)}</td><td class="r tot">${m(v.total)}</td>
      <td class="r">${m(v.official)}</td><td class="r">${m(v.cash)}</td><td>${r.saved ? (r.saved.isPaid ? 'Ödendi' : 'Kaydedildi') : 'Taslak'}</td><td class="sig"></td></tr>`;
  }).join('');
  const g = d.generatedAt;
  const p = (n: number) => String(n).padStart(2, '0');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Bordro ${esc(d.payroll.month)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 8.5px; color: #111; margin: 0; }
  h1 { font-size: 14px; margin: 0 0 2px; } .sub { color: #444; font-size: 9px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #9aa3b2; padding: 3px 4px; text-align: center; vertical-align: middle; }
  th { background: #e2e8f0; } th.tot, td.tot { background: #eff6ff; font-weight: bold; } .l { text-align: left; } .r { text-align: right; white-space: nowrap; }
  td span { color: #555; font-size: 7.5px; } td.sig { width: 70px; } tfoot td { background: #f1f5f9; font-weight: bold; }
  .note { margin-top: 6px; color: #444; } .sign { display: flex; justify-content: space-between; margin-top: 26px; }
  .sign div { width: 30%; border-top: 1px solid #333; padding-top: 3px; text-align: center; }
</style></head><body>
<h1>MAAŞ BORDROSU — ${esc(formatPeriod(d.payroll.month).toLocaleUpperCase('tr-TR'))}</h1>
<div class="sub">${esc(d.companyName)} · Kapsam: ${esc(d.scopeLabel)} · Günlük asgari ücret: ${m(d.payroll.dailyMinWageKurus)} · Oluşturma: ${p(g.getDate())}.${p(g.getMonth() + 1)}.${g.getFullYear()} ${p(g.getHours())}:${p(g.getMinutes())}</div>
<table>
  <thead><tr><th>#</th><th class="l">Ad Soyad / Görev</th><th class="l">T.C. / IBAN</th><th>Aylık maaş</th><th>Ücretli gün</th><th>Normal maaş</th><th>Mesai sa.</th><th>Mesai parası</th><th class="tot">TOPLAM</th><th>Asgari (resmi)</th><th>Elden</th><th>Durum</th><th>İmza</th></tr></thead>
  <tbody>${body || '<tr><td colspan="13">Bu kapsamda çalışan yok.</td></tr>'}</tbody>
  <tfoot><tr><td></td><td class="l">TOPLAM (${d.payroll.rows.length} çalışan)</td><td></td><td></td><td>${formatDays(sums.days)}</td><td class="r">${m(sums.normal)}</td><td></td><td class="r">${m(sums.ot)}</td><td class="r tot">${m(sums.total)}</td><td class="r">${m(sums.official)}</td><td class="r">${m(sums.cash)}</td><td></td><td></td></tr></tfoot>
</table>
<div class="note">Ücretli gün = 30 − eksik gün (Üİ, R, D ve boş gün = 1; Y = 0,5). Normal maaş = aylık maaş ÷ 30 × ücretli gün. Asgari = günlük asgari ücret × ücretli gün. Elden = Toplam − Asgari.</div>
<div class="sign"><div>Hazırlayan</div><div>Kontrol eden</div><div>Onaylayan</div></div>
</body></html>`;
}

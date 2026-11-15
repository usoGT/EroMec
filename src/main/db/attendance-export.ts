// Puantaj dışa aktarma: Excel (.xlsx) ve PDF — her şantiye ayrı sayfada, her çalışanın altında mesai satırı,
// sağda gün sayıları ve maaş sütunları (normal maaş, mesai parası, toplam, asgari, elden).
import ExcelJS from 'exceljs';
import type { AttendanceMonth, AttendanceRow } from '../../shared/types';
import { attendanceTotals, formatDays, textColorFor, toStatusMap, WEEKDAY_SHORT, type StatusDef } from '../../shared/attendance';
import { formatDate, formatPeriod, parseIsoDate } from '../../shared/dates';
import { formatMoney } from '../../shared/money';
import { computePay } from '../../shared/payroll';

export interface AttendanceExportData {
  month: AttendanceMonth;
  currencySymbol: string;
  companyName: string; // Ayarlar'daki şirket adı (rapor başlığı)
  scopeLabel: string; // "Bütün şantiyeler", "Yıldız İnşaat / Ataşehir" ...
  generatedAt: Date;
}

export interface AttendanceGroup {
  title: string; // sayfa adı: şantiye adı veya "Şantiyesiz"
  companyName: string | null;
  rows: AttendanceRow[];
}

/** Çalışanları bulundukları şantiyeye göre gruplar (her grup ayrı sayfa olur). */
export function groupBySite(rows: AttendanceRow[]): AttendanceGroup[] {
  const groups = new Map<string, AttendanceGroup>();
  for (const r of rows) {
    const key = r.siteId ? `s${r.siteId}` : 'none';
    if (!groups.has(key)) groups.set(key, { title: r.siteName ?? 'Şantiyesiz', companyName: r.companyName, rows: [] });
    groups.get(key)!.rows.push(r);
  }
  return [...groups.values()];
}

const isWeekend = (d: string) => [0, 6].includes(parseIsoDate(d).getDay());
const hours = (min: number) => Math.round((min / 60) * 100) / 100;
const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;

/** Bir satırın hesapları: gün sayıları ve maaş */
function rowCalc(r: AttendanceRow, data: AttendanceExportData) {
  const map = toStatusMap(data.month.statuses);
  return {
    t: attendanceTotals(r.cells, map),
    pay: computePay({ cells: r.cells, statuses: map, monthlySalaryKurus: r.monthlySalaryKurus, overtimeKurus: r.overtimeKurus, dailyMinWageKurus: data.month.dailyMinWageKurus }),
  };
}

function sheetName(title: string, used: Set<string>): string {
  const base = title.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 28) || 'Sayfa';
  let name = base;
  for (let i = 2; used.has(name.toLocaleLowerCase('tr-TR')); i++) name = `${base.slice(0, 25)} (${i})`;
  used.add(name.toLocaleLowerCase('tr-TR'));
  return name;
}

export async function buildAttendanceXlsx(data: AttendanceExportData): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Puanto';
  wb.created = data.generatedAt;
  const { days, statuses } = data.month;
  const byCode = toStatusMap(statuses);
  const sym = data.currencySymbol;
  const groups = groupBySite(data.month.rows);
  if (groups.length === 0) groups.push({ title: 'Puantaj', companyName: null, rows: [] });
  const used = new Set<string>();
  const thin = { style: 'thin' as const, color: { argb: 'FF8A94A6' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };

  for (const g of groups) {
    const ws = wb.addWorksheet(sheetName(g.title, used), {
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
      views: [{ state: 'frozen', xSplit: 5, ySplit: 5 }],
    });
    const fixed = ['Sıra', 'Sicil', 'Ad Soyad', 'Görev', 'T.C. Kimlik No'];
    // Sağdaki sütunlar: çalışılan gün, her fırçanın sayısı, mesai, maaş
    const totalsHead = ['Çalışılan gün', ...statuses.map((s) => `${s.label} (${s.short})`), 'Mesai (saat)', `Mesai parası (${sym})`,
      'Ücretli gün', `Normal maaş (${sym})`, `TOPLAM (${sym})`, `Asgari (${sym})`, `Elden (${sym})`];
    const firstTotal = fixed.length + days.length + 1;
    const otHoursCol = firstTotal + 1 + statuses.length;
    const payCol = otHoursCol + 2; // "Ücretli gün"
    const lastCol = fixed.length + days.length + totalsHead.length;
    const moneyCols = [otHoursCol + 1, payCol + 1, payCol + 2, payCol + 3, payCol + 4];

    ws.mergeCells(1, 1, 1, lastCol);
    ws.getCell(1, 1).value = `PUANTAJ CETVELİ — ${formatPeriod(data.month.month).toLocaleUpperCase('tr-TR')}`;
    ws.getCell(1, 1).font = { bold: true, size: 14 };
    ws.mergeCells(2, 1, 2, lastCol);
    ws.getCell(2, 1).value = `${data.companyName}   ·   Firma: ${g.companyName ?? '—'}   ·   Şantiye: ${g.title}   ·   Dönem: ${formatDate(days[0])} – ${formatDate(days[days.length - 1])}`;
    ws.getCell(2, 1).font = { size: 10, color: { argb: 'FF475569' } };

    const head = ws.getRow(4);
    const sub = ws.getRow(5);
    fixed.forEach((h, i) => { head.getCell(i + 1).value = h; ws.mergeCells(4, i + 1, 5, i + 1); });
    days.forEach((d, i) => {
      head.getCell(fixed.length + i + 1).value = Number(d.slice(8));
      sub.getCell(fixed.length + i + 1).value = WEEKDAY_SHORT[parseIsoDate(d).getDay()];
    });
    totalsHead.forEach((h, i) => {
      const col = firstTotal + i;
      head.getCell(col).value = h;
      ws.mergeCells(4, col, 5, col);
    });
    for (const r of [head, sub]) {
      r.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > lastCol) return;
        const day = days[col - fixed.length - 1];
        cell.font = { bold: true, size: 9 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.border = border;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: day && isWeekend(day) ? 'FFCBD5E1' : col === payCol + 2 ? 'FFFECACA' : 'FFE2E8F0' } };
      });
    }
    head.height = 42;

    const sum = { worked: 0, otMin: 0, ot: 0, normal: 0, total: 0, official: 0, cash: 0 };
    g.rows.forEach((r, idx) => {
      const { t, pay } = rowCalc(r, data);
      sum.worked += t.workedDays; sum.otMin += r.overtimeMinutes; sum.ot += r.overtimeKurus;
      sum.normal += pay.normalKurus; sum.total += pay.totalKurus; sum.official += pay.officialKurus; sum.cash += pay.cashKurus;
      const values: (string | number | null)[] = [
        idx + 1, r.employeeNo, r.fullName + (r.status === 'left' ? ' (ayrıldı)' : ''), r.position, r.nationalId || '',
        ...days.map((d) => (r.cells[d] ? byCode[r.cells[d]]?.short ?? '?' : '')),
        t.workedDays, ...statuses.map((s) => t.counts[s.code] || null), hours(r.overtimeMinutes) || null, r.overtimeKurus ? r.overtimeKurus / 100 : null,
        pay.paidDays, pay.normalKurus / 100, pay.totalKurus / 100, pay.officialKurus / 100, pay.cashKurus / 100,
      ];
      const row = ws.addRow(values);
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > lastCol) return;
        cell.border = border;
        cell.font = { size: 9 };
        cell.alignment = { vertical: 'middle', horizontal: col === 3 || col === 4 ? 'left' : 'center' };
        const day = days[col - fixed.length - 1];
        if (day) {
          const st = byCode[r.cells[day]];
          if (st) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(st.color) } };
            cell.font = { size: 9, bold: true, color: { argb: argb(textColorFor(st.color)) } };
          } else if (isWeekend(day)) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
          }
        }
        if (moneyCols.includes(col)) { cell.numFmt = '#,##0.00'; cell.alignment = { vertical: 'middle', horizontal: 'right' }; }
      });
      row.getCell(firstTotal).font = { size: 9, bold: true };
      row.getCell(otHoursCol).numFmt = '0.00';
      row.getCell(payCol + 2).font = { size: 9, bold: true };

      // Altındaki satır: günlük mesai saatleri
      const otRow = ws.addRow([null, null, '   Mesai (saat)', null, null, ...days.map((d) => (r.overtime[d] ? hours(r.overtime[d]) : null))]);
      otRow.eachCell({ includeEmpty: true }, (cell, col) => {
        if (col > lastCol) return;
        cell.border = border;
        cell.font = { size: 8, italic: col === 3, color: { argb: 'FF991B1B' } };
        cell.alignment = { vertical: 'middle', horizontal: col === 3 ? 'left' : 'center' };
        cell.numFmt = '0.##';
        const day = days[col - fixed.length - 1];
        if (day && r.overtime[day]) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        else if (day && isWeekend(day)) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      });
      for (const col of [1, 2]) ws.mergeCells(row.number, col, otRow.number, col);
    });

    const total = ws.addRow([]);
    total.getCell(3).value = `TOPLAM (${g.rows.length} çalışan)`;
    total.getCell(firstTotal).value = sum.worked;
    total.getCell(otHoursCol).value = hours(sum.otMin);
    total.getCell(otHoursCol + 1).value = sum.ot / 100;
    total.getCell(payCol + 1).value = sum.normal / 100;
    total.getCell(payCol + 2).value = sum.total / 100;
    total.getCell(payCol + 3).value = sum.official / 100;
    total.getCell(payCol + 4).value = sum.cash / 100;
    total.eachCell({ includeEmpty: true }, (cell, col) => {
      if (col > lastCol) return;
      cell.font = { bold: true, size: 9 };
      cell.border = border;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      cell.alignment = { horizontal: col === 3 ? 'left' : moneyCols.includes(col) ? 'right' : 'center' };
      if (moneyCols.includes(col)) cell.numFmt = '#,##0.00';
    });
    total.getCell(otHoursCol).numFmt = '0.00';

    ws.addRow([]);
    const legend = ws.addRow(['Fırçalar: ' + statuses.map((s) => `${s.short} = ${s.label}`).join('   ·   ')]);
    ws.mergeCells(legend.number, 1, legend.number, lastCol);
    legend.getCell(1).font = { size: 9, color: { argb: 'FF475569' } };
    const rule = ws.addRow(['Ücretli gün = işaretlenen günlerin toplamı (ay hesabı yapılmaz). Normal maaş = aylık maaş ÷ 30 × ücretli gün. Asgari = günlük asgari ücret × ücretli gün. Elden = TOPLAM − asgari.']);
    ws.mergeCells(rule.number, 1, rule.number, lastCol);
    rule.getCell(1).font = { size: 9, color: { argb: 'FF475569' } };
    ws.addRow([]);
    const sign = ws.addRow([]);
    sign.getCell(3).value = 'Hazırlayan: ______________________';
    sign.getCell(fixed.length + Math.floor(days.length / 2)).value = 'Kontrol eden: ______________________';
    sign.getCell(firstTotal + 2).value = 'Onaylayan: ______________________';
    sign.font = { size: 10 };

    [5, 7, 22, 14, 13].forEach((w, i) => (ws.getColumn(i + 1).width = w));
    days.forEach((_, i) => (ws.getColumn(fixed.length + i + 1).width = 4.2));
    for (let c = firstTotal; c <= lastCol; c++) ws.getColumn(c).width = moneyCols.includes(c) ? 12 : 8;
    ws.headerFooter.oddFooter = `&L${data.companyName} — Puanto&RSayfa &P / &N`;
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function buildAttendanceHtml(data: AttendanceExportData): string {
  const { days, statuses } = data.month;
  const byCode = toStatusMap(statuses);
  const groups = groupBySite(data.month.rows);
  const money = (k: number) => esc(formatMoney(k, data.currencySymbol));
  const pad = (n: number) => String(n).padStart(2, '0');
  const g0 = data.generatedAt;
  const stamp = `${pad(g0.getDate())}.${pad(g0.getMonth() + 1)}.${g0.getFullYear()} ${pad(g0.getHours())}:${pad(g0.getMinutes())}`;
  const chip = (s: StatusDef) => `<span class="chip" style="background:${s.color};color:${textColorFor(s.color)}">${esc(s.short)}</span>`;
  const dayHead = days.map((d) => `<th class="d${isWeekend(d) ? ' we' : ''}">${Number(d.slice(8))}<br><span>${WEEKDAY_SHORT[parseIsoDate(d).getDay()]}</span></th>`).join('');
  const countHead = statuses.map((s) => `<th class="t" title="${esc(s.label)}">${esc(s.short)}</th>`).join('');

  const sections = (groups.length ? groups : [{ title: 'Puantaj', companyName: null, rows: [] }]).map((g) => {
    const sum = { worked: 0, otMin: 0, ot: 0, normal: 0, total: 0, official: 0, cash: 0 };
    const body = g.rows.map((r, i) => {
      const { t, pay } = rowCalc(r, data);
      sum.worked += t.workedDays; sum.otMin += r.overtimeMinutes; sum.ot += r.overtimeKurus;
      sum.normal += pay.normalKurus; sum.total += pay.totalKurus; sum.official += pay.officialKurus; sum.cash += pay.cashKurus;
      const cells = days.map((d) => {
        const st = byCode[r.cells[d]];
        if (!st) return `<td class="c${isWeekend(d) ? ' we' : ''}"></td>`;
        return `<td class="c" style="background:${st.color};color:${textColorFor(st.color)}">${esc(st.short)}</td>`;
      }).join('');
      const otCells = days.map((d) => `<td class="ot${isWeekend(d) ? ' we' : ''}${r.overtime[d] ? ' has' : ''}">${r.overtime[d] ? formatDays(hours(r.overtime[d])) : ''}</td>`).join('');
      return `<tr><td rowspan="2">${i + 1}</td><td class="n">${esc(r.fullName)}${r.status === 'left' ? ' <i>(ayrıldı)</i>' : ''}<br><span>${esc(r.position)}${r.nationalId ? ` · ${r.nationalId}` : ''}</span></td>${cells}
        <td class="t b">${formatDays(t.workedDays)}</td>${statuses.map((s) => `<td class="t">${t.counts[s.code] || ''}</td>`).join('')}
        <td class="t b">${r.overtimeMinutes ? formatDays(hours(r.overtimeMinutes)) : ''}</td><td class="m">${r.overtimeKurus ? money(r.overtimeKurus) : ''}</td>
        <td class="t">${formatDays(pay.paidDays)}</td><td class="m">${money(pay.normalKurus)}</td><td class="m b tot">${money(pay.totalKurus)}</td><td class="m">${money(pay.officialKurus)}</td><td class="m">${money(pay.cashKurus)}</td></tr>
        <tr class="otrow"><td class="n ot">Mesai (saat)</td>${otCells}<td colspan="${statuses.length + 8}" class="ot"></td></tr>`;
    }).join('');
    return `<section>
      <h1>PUANTAJ CETVELİ — ${esc(formatPeriod(data.month.month).toLocaleUpperCase('tr-TR'))}</h1>
      <div class="sub">${esc(data.companyName)} · Firma: ${esc(g.companyName ?? '—')} · Şantiye: <b>${esc(g.title)}</b> · Oluşturma: ${stamp}</div>
      <table>
        <thead><tr><th>#</th><th class="n">Ad Soyad / Görev / T.C.</th>${dayHead}<th class="t">Gün</th>${countHead}<th class="t">Mesai sa.</th><th class="m">Mesai parası</th><th class="t">Ücr. gün</th><th class="m">Normal maaş</th><th class="m tot">TOPLAM</th><th class="m">Asgari</th><th class="m">Elden</th></tr></thead>
        <tbody>${body || `<tr><td colspan="${days.length + statuses.length + 10}" class="empty">Bu şantiyede çalışan yok.</td></tr>`}</tbody>
        <tfoot><tr><td></td><td class="n">TOPLAM (${g.rows.length} çalışan)</td>${days.map(() => '<td></td>').join('')}<td class="t b">${formatDays(sum.worked)}</td>${statuses.map(() => '<td></td>').join('')}<td class="t b">${sum.otMin ? formatDays(hours(sum.otMin)) : ''}</td><td class="m b">${money(sum.ot)}</td><td></td><td class="m b">${money(sum.normal)}</td><td class="m b tot">${money(sum.total)}</td><td class="m b">${money(sum.official)}</td><td class="m b">${money(sum.cash)}</td></tr></tfoot>
      </table>
      <div class="legend">${statuses.map((s) => `${chip(s)} ${esc(s.label)}`).join(' &nbsp; ')}</div>
      <div class="legend">Ücretli gün = işaretlenen günlerin toplamı. Normal maaş = aylık maaş ÷ 30 × ücretli gün. Asgari = günlük asgari ücret × ücretli gün. Elden = TOPLAM − asgari.</div>
      <div class="sign"><div>Hazırlayan</div><div>Kontrol eden</div><div>Onaylayan</div></div>
    </section>`;
  }).join('');

  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Puantaj ${esc(data.month.month)}</title>
<style>
  @page { size: A3 landscape; margin: 8mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #111; margin: 0; font-size: 7.5px; }
  section { page-break-after: always; } section:last-child { page-break-after: auto; }
  h1 { font-size: 13px; margin: 0 0 2px; } .sub { font-size: 9px; color: #444; margin-bottom: 6px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #8a94a6; padding: 1px; text-align: center; overflow: hidden; }
  th { background: #e2e8f0; font-size: 7px; } th span, td.n span { color: #555; font-weight: normal; font-size: 6.5px; }
  th:first-child, td:first-child { width: 14px; }
  .n { text-align: left; width: 120px; padding-left: 3px; } .c { font-weight: bold; }
  .we { background: #e5e9f0; } th.we { background: #cbd5e1; }
  .t { width: 18px; } .b { font-weight: bold; } tfoot td { background: #f1f5f9; font-weight: bold; }
  .m { width: 46px; text-align: right; padding-right: 2px; white-space: nowrap; } .tot { background: #fee2e2; }
  .ot { color: #991b1b; font-size: 6.5px; font-style: italic; } td.ot.has { background: #fee2e2; font-style: normal; font-weight: bold; }
  tr.otrow td { border-top: 1px dashed #c3cad5; }
  .legend { margin-top: 6px; font-size: 8px; } .chip { display: inline-block; padding: 0 3px; font-weight: bold; }
  .sign { display: flex; justify-content: space-between; margin-top: 22px; font-size: 9px; }
  .sign div { width: 30%; border-top: 1px solid #333; padding-top: 3px; text-align: center; }
  .empty { padding: 12px; color: #666; }
</style></head><body>${sections}</body></html>`;
}

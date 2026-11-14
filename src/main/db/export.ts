// Rapor dışa aktarma: CSV (Excel ile açılır) ve PDF için HTML üretimi.
import type { AppSettings, Expense, OvertimeRecord, Summary } from '../../shared/types';
import { formatDate } from '../../shared/dates';
import { CURRENCY_SYMBOLS, formatMoney } from '../../shared/money';
import { formatHoursDecimal } from '../../shared/overtime';

export interface ReportData {
  title: string;
  /** Raporun kapsadığı firma/şantiye açıklaması */
  scope: string;
  settings: AppSettings;
  summary: Summary;
  expenses: Expense[];
  overtime: OvertimeRecord[];
  generatedAt: Date;
}

/** Excel'in Türkçe ayarlarında sayı olarak tanıyacağı biçim: 1250,50 */
function csvAmount(kurus: number): string {
  const abs = Math.abs(kurus);
  return `${kurus < 0 ? '-' : ''}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Rapor özeti satırları: [bölüm başlığı | kalem, tutar, not, toplam satırı mı] */
export type SummaryRow = { label: string; kurus: number | null; note: string; strong?: boolean; section?: boolean };

export function costRows(s: Summary): SummaryRow[] {
  return [
    { label: 'Personel maliyeti (puantajdan)', kurus: s.costLaborKurus, note: `toplam ${String(s.costLaborDays).replace('.', ',')} ücretli adam-gün · aylık maaş ÷ 30 × işaretlenen gün` },
    { label: 'Mesai maliyeti (mesai kayıtlarından)', kurus: s.costOvertimeKurus, note: 'Saat × saatlik ücret' },
    { label: 'Diğer giderler', kurus: s.costOtherKurus, note: 'Maaş ve ek mesai dışındaki giderler' },
    { label: 'TOPLAM MALİYET', kurus: s.costTotalKurus, note: 'Personel + Mesai + Diğer', strong: true },
  ];
}

export function expenseRows(s: Summary): SummaryRow[] {
  return [
    { label: 'Maaş ödemeleri', kurus: s.expSalaryKurus, note: 'Bordro veya Giderler (maaş türü kategoriler)' },
    { label: 'Mesai ödemeleri', kurus: s.expOvertimeKurus, note: 'Ek mesai türü kategoriler' },
    { label: 'Diğer giderler', kurus: s.expOtherKurus, note: 'Genel gider türü kategoriler' },
    { label: 'TOPLAM GİDER', kurus: s.expTotalKurus, note: 'Kaydedilen bütün gider kayıtları', strong: true },
    { label: 'Ödenen', kurus: s.paidKurus, note: '“Ödendi” olan gider kayıtları' },
    { label: 'Ödenmemiş (borç)', kurus: s.unpaidKurus, note: '“Ödenmedi” olan gider kayıtları' },
  ];
}

export function summaryRows(s: Summary): SummaryRow[] {
  return [
    { label: 'MALİYET (yapılan işin bedeli)', kurus: null, note: '', section: true },
    ...costRows(s),
    { label: 'GİDER (kaydedilen ödemeler)', kurus: null, note: '', section: true },
    ...expenseRows(s),
    { label: 'FARK (maliyet − gider)', kurus: s.diffKurus, note: s.diffKurus > 0 ? 'Henüz gidere işlenmemiş maliyet (ör. kaydedilmemiş bordro)' : s.diffKurus < 0 ? 'Gider, bu dönemin maliyetinden fazla (ör. önceki dönem ödemesi)' : 'Maliyet ve gider eşit', strong: true },
  ];
}

export function buildReportCsv(d: ReportData): string {
  const lines: string[] = [];
  const row = (...cells: (string | number)[]) => lines.push(cells.map(csvCell).join(';'));
  const sym = CURRENCY_SYMBOLS[d.settings.currency] ?? '₺';
  row(`${d.settings.companyName} - ${d.title}`);
  row('Dönem', `${formatDate(d.summary.from)} - ${formatDate(d.summary.to)}`);
  row('Kapsam', d.scope);
  row('Para birimi', sym);
  row('');
  row('Kalem', `Tutar (${sym})`, 'Not');
  for (const r of summaryRows(d.summary)) row(r.label, r.kurus === null ? '' : csvAmount(r.kurus), r.note);
  row('');
  row('GİDERLER');
  row('Tarih', 'Şantiye', 'Gider adı', 'Kategori', `Tutar (${sym})`, 'Ödeme durumu', 'Açıklama');
  for (const e of d.expenses) {
    row(formatDate(e.date), e.siteName ?? '', e.name, e.categoryName, csvAmount(e.amountKurus), e.isPaid ? 'Ödendi' : 'Ödenmedi', e.description);
  }
  row('');
  row('MESAİLER');
  row('Çalışan', 'Şantiye', 'Tarih', 'Başlangıç', 'Bitiş', 'Mola (dk)', 'Toplam saat', `Saatlik ücret (${sym})`, `Tutar (${sym})`, 'Açıklama');
  for (const o of d.overtime) {
    row(o.employeeName, o.siteName ?? '', formatDate(o.date), o.startTime, o.endTime, o.breakMinutes, formatHoursDecimal(o.workedMinutes),
      csvAmount(o.hourlyRateKurus), csvAmount(o.totalKurus), o.description);
  }
  // UTF-8 BOM: Excel'in Türkçe karakterleri doğru göstermesi için.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function buildReportHtml(d: ReportData): string {
  const sym = CURRENCY_SYMBOLS[d.settings.currency] ?? '₺';
  const m = (k: number) => esc(formatMoney(k, sym));
  const sumRows = summaryRows(d.summary)
    .map((r) => r.section
      ? `<tr class="section"><td colspan="3">${esc(r.label)}</td></tr>`
      : `<tr${r.strong ? ' class="total"' : ''}><td>${esc(r.label)}</td><td class="num">${m(r.kurus ?? 0)}</td><td class="note">${esc(r.note)}</td></tr>`)
    .join('');
  const exp = d.expenses
    .map((e) => `<tr><td>${formatDate(e.date)}</td><td>${esc(e.siteName ?? '')}</td><td>${esc(e.name)}</td><td>${esc(e.categoryName)}</td><td class="num">${m(e.amountKurus)}</td><td>${e.isPaid ? 'Ödendi' : 'Ödenmedi'}</td><td>${esc(e.description)}</td></tr>`)
    .join('');
  const ot = d.overtime
    .map((o) => `<tr><td>${esc(o.employeeName)}</td><td>${esc(o.siteName ?? '')}</td><td>${formatDate(o.date)}</td><td>${o.startTime}-${o.endTime}</td><td class="num">${o.breakMinutes} dk</td><td class="num">${formatHoursDecimal(o.workedMinutes)}</td><td class="num">${m(o.hourlyRateKurus)}</td><td class="num">${m(o.totalKurus)}</td></tr>`)
    .join('');
  const g = d.generatedAt;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(d.title)}</title>
<style>
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 11px; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin: 0; } h2 { font-size: 13px; margin: 18px 0 6px; }
  .sub { color: #555; margin: 2px 0 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #e8eef6; }
  .num { text-align: right; white-space: nowrap; }
  .note { color: #555; }
  tr.total td { font-weight: bold; background: #fee2e2; }
  tr.section td { font-weight: bold; color: #fff; background: #111; }
  .empty { color: #777; font-style: italic; }
</style></head><body>
<h1>${esc(d.settings.companyName)} — ${esc(d.title)}</h1>
<div class="sub">Dönem: ${formatDate(d.summary.from)} – ${formatDate(d.summary.to)} · Kapsam: ${esc(d.scope)} · Oluşturma: ${pad(g.getDate())}.${pad(g.getMonth() + 1)}.${g.getFullYear()} ${pad(g.getHours())}:${pad(g.getMinutes())}</div>
<h2>Özet</h2><table><tr><th>Kalem</th><th class="num">Tutar</th><th>Not</th></tr>${sumRows}</table>
<h2>Giderler (${d.expenses.length})</h2>
${d.expenses.length ? `<table><tr><th>Tarih</th><th>Şantiye</th><th>Gider adı</th><th>Kategori</th><th class="num">Tutar</th><th>Durum</th><th>Açıklama</th></tr>${exp}</table>` : '<p class="empty">Bu dönemde gider kaydı yok.</p>'}
<h2>Mesailer (${d.overtime.length})</h2>
${d.overtime.length ? `<table><tr><th>Çalışan</th><th>Şantiye</th><th>Tarih</th><th>Saat</th><th class="num">Mola</th><th class="num">Saat</th><th class="num">Saatlik ücret</th><th class="num">Tutar</th></tr>${ot}</table>` : '<p class="empty">Bu dönemde mesai kaydı yok.</p>'}
</body></html>`;
}

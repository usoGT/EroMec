import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, FileDown, FileText } from 'lucide-react';
import type { PageId } from '../App';
import { formatPeriod } from '../../shared/dates';
import type { Summary } from '../../shared/types';
import { formatDate, MONTH_NAMES, monthRange, todayIso, weekRange } from '../../shared/dates';
import { formatMinutes } from '../../shared/overtime';
import { formatDays } from '../../shared/attendance';
import { api } from '../lib/api';
import { useApp } from '../lib/context';
import PageHeader from '../components/PageHeader';
import { ScopeSelect } from '../components/SiteSelect';
import { scopeToFilter, useSites } from '../lib/useSites';

type Mode = 'day' | 'week' | 'month' | 'custom';
const MODES: [Mode, string][] = [['day', 'Günlük'], ['week', 'Haftalık'], ['month', 'Aylık'], ['custom', 'Özel tarih aralığı']];

export default function ReportsPage({ onNavigate }: { onNavigate?: (p: PageId) => void }) {
  const { money, toast, showError } = useApp();
  const today = todayIso();
  const [mode, setMode] = useState<Mode>('month');
  const [day, setDay] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [custom, setCustom] = useState(monthRange(today));
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState('');
  const { companies, sites } = useSites();
  const scopeLabel = useMemo(() => {
    const f = scopeToFilter(scope);
    if (f.siteId) return sites.find((s) => s.id === f.siteId)?.name ?? '';
    if (f.companyId) return companies.find((c) => c.id === f.companyId)?.name ?? '';
    return '';
  }, [scope, sites, companies]);

  const range = useMemo(() => {
    if (mode === 'day') return { from: day, to: day };
    if (mode === 'week') return weekRange(day || today);
    if (mode === 'month') return monthRange(`${month || today.slice(0, 7)}-01`);
    return custom;
  }, [mode, day, month, custom, today]);

  const title = useMemo(() => {
    if (mode === 'day') return `Günlük Rapor ${formatDate(range.from)}`;
    if (mode === 'week') return `Haftalık Rapor ${formatDate(range.from)} - ${formatDate(range.to)}`;
    if (mode === 'month') {
      const [y, m] = range.from.split('-').map(Number);
      return `Aylık Rapor ${MONTH_NAMES[m - 1]} ${y}`;
    }
    return `Rapor ${formatDate(range.from)} - ${formatDate(range.to)}`;
  }, [mode, range]);
  const fullTitle = scopeLabel ? `${title} - ${scopeLabel}` : title;

  const load = useCallback(async () => {
    if (!range.from || !range.to) {
      setData(null);
      setError('Lütfen tarih seçin.');
      return;
    }
    try {
      setData(await api.summary({ ...range, ...scopeToFilter(scope) }));
      setError(null);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [range, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportAs = async (kind: 'csv' | 'pdf') => {
    if (!data || busy) return;
    setBusy(true);
    try {
      const args = { ...range, ...scopeToFilter(scope), title: fullTitle };
      const r = kind === 'csv' ? await api.reportExportCsv(args) : await api.reportExportPdf(args);
      if (r.saved) toast(`Rapor kaydedildi: ${r.path}`);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  type Row = { label: string; value: number; note: string; strong?: boolean; warn?: boolean; testId?: string };
  const costRows: Row[] = data
    ? [
        { label: 'Personel maliyeti', value: data.costLaborKurus, note: `Puantajdan: toplam ${formatDays(data.costLaborDays)} ücretli adam-gün × günlük ücret (aylık maaş ÷ 30)`, testId: 'cost-labor' },
        { label: 'Mesai maliyeti', value: data.costOvertimeKurus, note: `${data.overtimeCount} mesai kaydı · ${formatMinutes(data.overtimeMinutes)}`, testId: 'cost-overtime' },
        { label: 'Diğer giderler', value: data.costOtherKurus, note: 'Maaş ve ek mesai dışındaki giderler', testId: 'cost-other' },
        { label: 'TOPLAM MALİYET', value: data.costTotalKurus, note: 'Personel + mesai + diğer', strong: true, testId: 'cost-total' },
      ]
    : [];
  const expRows: Row[] = data
    ? [
        { label: 'Maaş ödemeleri', value: data.expSalaryKurus, note: 'Bordro veya Giderler’den kaydedilen maaşlar', testId: 'exp-salary' },
        { label: 'Mesai ödemeleri', value: data.expOvertimeKurus, note: '“Ek mesai” türündeki gider kayıtları', testId: 'exp-overtime' },
        { label: 'Diğer giderler', value: data.expOtherKurus, note: 'Genel gider türündeki kayıtlar', testId: 'exp-other' },
        { label: 'TOPLAM GİDER', value: data.expTotalKurus, note: 'Kaydedilen bütün giderler', strong: true, testId: 'exp-total' },
        { label: 'Ödenen', value: data.paidKurus, note: '“Ödendi” olan kayıtlar', testId: 'exp-paid' },
        { label: 'Ödenmemiş (borç)', value: data.unpaidKurus, note: '“Ödenmedi” olan kayıtlar', warn: data.unpaidKurus > 0, testId: 'exp-unpaid' },
      ]
    : [];
  const side = (title: string, sub: string, label: string, list: Row[]) => (
    <div className="card overflow-hidden">
      <div className="border-b-2 border-red-600 bg-neutral-900 px-4 py-2 text-white">
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-white/70">{sub}</div>
      </div>
      <table className="w-full text-sm" aria-label={label}>
        <tbody>
          {list.map((r) => (
            <tr key={r.label} className={`border-b border-slate-100 last:border-b-0 ${r.strong ? 'bg-brand-50' : ''}`}>
              <td className="px-4 py-2">
                <div className={r.strong ? 'font-bold' : 'font-medium'}>{r.label}</div>
                <div className="text-xs text-slate-500">{r.note}</div>
              </td>
              <td className={`px-4 py-2 text-right tabular-nums ${r.strong ? 'text-lg font-bold' : 'font-semibold'} ${r.warn ? 'text-amber-700' : ''}`} data-testid={r.testId}>{money(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Raporlar"
        description="Dönem seçin; tutarlar veritabanındaki kayıtlardan hesaplanır."
        actions={
          <>
            <button className="btn-secondary" disabled={!data || busy} onClick={() => void exportAs('csv')}><FileDown size={16} /> Excel / CSV olarak kaydet</button>
            <button className="btn-secondary" disabled={!data || busy} onClick={() => void exportAs('pdf')}><FileText size={16} /> PDF olarak kaydet</button>
          </>
        }
      />
      <div className="card mb-4 flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="flex overflow-hidden rounded border border-slate-300" role="group" aria-label="Rapor dönemi">
          {MODES.map(([k, label]) => (
            <button key={k} onClick={() => setMode(k)}
              className={`border-r border-slate-300 px-3 py-1.5 text-sm last:border-r-0 ${mode === k ? 'bg-brand-600 text-white' : 'bg-surface hover:bg-slate-50'}`}>
              {label}
            </button>
          ))}
        </div>
        {(mode === 'day' || mode === 'week') && (
          <label className="flex items-center gap-2 text-sm">
            {mode === 'day' ? 'Gün:' : 'Haftadaki herhangi bir gün:'}
            <input type="date" className="input w-40" value={day} onChange={(e) => setDay(e.target.value)} />
          </label>
        )}
        {mode === 'month' && (
          <label className="flex items-center gap-2 text-sm">
            Ay:
            <input type="month" className="input w-44" value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
        )}
        {mode === 'custom' && (
          <div className="flex items-center gap-2 text-sm">
            <input type="date" aria-label="Başlangıç tarihi" className="input w-40" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            –
            <input type="date" aria-label="Bitiş tarihi" className="input w-40" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </div>
        )}
        <ScopeSelect companies={companies} sites={sites} value={scope} onChange={setScope} />
        <span className="ml-auto text-sm text-slate-600" data-testid="report-range">
          Dönem: <b>{formatDate(range.from)} – {formatDate(range.to)}</b>
        </span>
      </div>

      {error && <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}

      {data && (
        <div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {side('MALİYET', 'Yapılan işin bedeli: puantaj + mesai + diğer giderler', 'Maliyet', costRows)}
            {side('GİDER', 'Kaydedilen ödemeler: Giderler tablosundaki kayıtlar', 'Gider', expRows)}
          </div>
          <div className={`mt-3 flex flex-wrap items-center gap-3 rounded border px-4 py-3 text-sm ${data.diffKurus > 0 ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-200 bg-surface text-slate-700'}`}>
            <b>Fark (maliyet − gider):</b>
            <span className="text-lg font-bold tabular-nums" data-testid="diff">{money(data.diffKurus)}</span>
            <span className="text-xs">
              {data.diffKurus > 0 ? 'Yapılan işin bu kadarı henüz gidere işlenmedi (kaydedilmemiş bordro, ödenmemiş mesai vb.).'
                : data.diffKurus < 0 ? 'Kaydedilen gider bu dönemin maliyetinden fazla (ör. önceki dönemin maaş ödemesi bu döneme kaydedilmiş).'
                : 'Maliyet ve gider eşit.'}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <div className="col-span-2 sm:col-span-3">
            {data.pendingSalaryCount > 0 && (
              <div className="mt-3 flex items-center gap-3 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800" data-testid="pending-salary">
                <span className="flex-1">
                  {data.pendingMonths.map(formatPeriod).join(', ')} için <b>{data.pendingSalaryCount} çalışanın bordrosu henüz kaydedilmedi</b>.
                  Puantajdan hesaplanan normal maaş: <b>{money(data.pendingSalaryKurus)}</b> — maliyette görünür, bordro kaydedilene kadar gidere dahil değildir.
                </span>
                {onNavigate && <button className="btn-secondary" onClick={() => onNavigate('payroll')}><Banknote size={15} /> Bordroya git</button>}
              </div>
            )}
            <div className="mt-3 rounded border border-slate-200 bg-surface px-4 py-3 text-xs leading-relaxed text-slate-600">
              <b className="text-slate-800">Hesaplama nasıl yapılır?</b>
              <ul className="mt-1 list-disc pl-4">
                <li><b>Maliyet</b> = yapılan işin bedeli. Personel maliyeti puantajdaki işaretli günlerden (aylık maaş ÷ 30 × ücretli gün), mesai maliyeti mesai kayıtlarından gelir; diğer giderler eklenir. Bordro kaydedilmiş aylarda kayıttaki aylık maaş kullanılır.</li>
                <li><b>Gider</b> = kaydedilen ödemeler. Bordroyu kaydedince maaş ve mesai ödemeleri buraya düşer; elle girilen giderler de buradadır.</li>
                <li><b>Fark</b> artıysa yapılan işin bir kısmı henüz gidere işlenmemiştir (ör. bu ayın bordrosu kaydedilmedi); eksiyse önceki dönemlerin ödemesi bu döneme girmiştir.</li>
                <li>Ödenen / ödenmemiş tutarlar Giderler tablosundaki kayıtların ödeme durumundan gelir.</li>
                <li>Hafta pazartesi başlar, pazar biter.</li>
              </ul>
            </div>
          </div>
          <div className="col-span-2">
            <table className="grid-table card" aria-label="Kategori dağılımı">
              <thead><tr><th>Gider kategorisi (kaydedilen)</th><th className="text-right">Tutar</th></tr></thead>
              <tbody>
                {data.byCategory.map((c) => (
                  <tr key={c.name}>
                    <td>{c.name}</td>
                    <td className="text-right tabular-nums">{money(c.kurus)}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td>Toplam gider</td>
                  <td className="text-right tabular-nums">{money(data.expTotalKurus)}</td>
                </tr>
              </tbody>
            </table>
            {data.expenseCount === 0 && data.overtimeCount === 0 && (
              <p className="mt-3 text-sm text-slate-500">Bu dönemde gider veya mesai kaydı bulunmuyor.</p>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

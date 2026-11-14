// Puantaj: çalışan × gün tablosu. Fırça seçilip hücrelere tıklanarak/sürüklenerek işaretlenir.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Eraser, FileSpreadsheet, FileText, Settings2, Users, Wand2 } from 'lucide-react';
import type { AttendanceEntry, AttendanceMonth, AttendanceRow, Employee } from '../../shared/types';
import { attendanceTotals, formatDays, textColorFor, toStatusMap, WEEKDAY_SHORT, type AttendanceStatus } from '../../shared/attendance';
import { MONTH_NAMES, parseIsoDate, todayIso } from '../../shared/dates';
import { computePay } from '../../shared/payroll';
import { api } from '../lib/api';
import { useApp } from '../lib/context';
import { scopeToFilter, useSites } from '../lib/useSites';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { ScopeSelect } from '../components/SiteSelect';
import CellOvertimeModal from './CellOvertimeModal';
import BulkOvertimeForm from './BulkOvertimeForm';
import BrushEditor from './BrushEditor';
import BulkAttendanceForm from './BulkAttendanceForm';

type Brush = AttendanceStatus | 'erase' | 'overtime';

/** Dakikayı kısa saat yazısına çevirir: 150 -> "2,5" */
const shortHours = (min: number) => formatDays(Math.round(min / 6) / 10);

export default function AttendancePage() {
  const { money, toast, showError } = useApp();
  const { companies, sites } = useSites();
  const today = todayIso();
  const gridRef = useRef<HTMLDivElement>(null);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [scope, setScope] = useState('');
  const [data, setData] = useState<AttendanceMonth | null>(null);
  const [brush, setBrush] = useState<Brush>('X');
  const [fillOpen, setFillOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [brushEdit, setBrushEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [otCell, setOtCell] = useState<{ row: AttendanceRow; date: string } | null>(null);
  const [otDay, setOtDay] = useState<string | null>(null);
  // Sürükleyerek boyama: değişiklikler biriktirilir, fare bırakılınca tek seferde kaydedilir.
  const painting = useRef<{ mode: AttendanceStatus | null; pending: Map<string, AttendanceEntry> } | null>(null);

  const filter = scopeToFilter(scope);
  const writeSiteId = filter.siteId; // tek şantiye seçiliyse kayıtlar o şantiyeye yazılır

  const load = useCallback(async () => {
    try {
      const [d, emps] = await Promise.all([api.attendanceMonth({ month, ...scopeToFilter(scope) }), api.employeesList()]);
      setData(d);
      setEmployees(emps);
    } catch (e) {
      showError(e);
    }
  }, [month, scope, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const commit = useCallback(async (entries: AttendanceEntry[]) => {
    if (entries.length === 0) return;
    try {
      await api.attendanceSet({ entries, siteId: writeSiteId });
    } catch (e) {
      showError(e);
      await load(); // ekrandaki iyimser değişikliği geri al
    }
  }, [writeSiteId, showError, load]);

  const applyLocal = (entries: AttendanceEntry[]) => {
    setData((d) => {
      if (!d) return d;
      const byEmp = new Map<number, AttendanceEntry[]>();
      for (const e of entries) byEmp.set(e.employeeId, [...(byEmp.get(e.employeeId) ?? []), e]);
      return {
        ...d,
        rows: d.rows.map((r) => {
          const list = byEmp.get(r.employeeId);
          if (!list) return r;
          const cells = { ...r.cells };
          for (const e of list) {
            if (e.status) cells[e.date] = e.status;
            else delete cells[e.date];
          }
          return { ...r, cells };
        }),
      };
    });
  };

  const paintCell = (employeeId: number, date: string) => {
    const p = painting.current;
    if (!p) return;
    const entry = { employeeId, date, status: p.mode };
    p.pending.set(`${employeeId}:${date}`, entry);
    applyLocal([entry]);
  };

  const startPaint = (employeeId: number, date: string, current: AttendanceStatus | undefined) => {
    if (brush === 'overtime') {
      const row = data?.rows.find((r) => r.employeeId === employeeId);
      if (row) setOtCell({ row, date });
      return;
    }
    // Aynı durumdaki hücreye fırçayla basılırsa bu sürükleme silme olarak çalışır (aç/kapa)
    const mode = brush === 'erase' || current === brush ? null : brush;
    painting.current = { mode, pending: new Map() };
    paintCell(employeeId, date);
  };

  useEffect(() => {
    const up = () => {
      const p = painting.current;
      painting.current = null;
      if (p) void commit([...p.pending.values()]);
    };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [commit]);

  /** Gün başlığına tıklanınca seçili fırça o gündeki bütün çalışanlara uygulanır. */
  const paintColumn = (date: string) => {
    if (!data || data.rows.length === 0) return;
    if (brush === 'overtime') {
      setOtDay(date); // o gün listedeki herkese toplu mesai
      return;
    }
    const status = brush === 'erase' ? null : brush;
    const entries = data.rows.map((r) => ({ employeeId: r.employeeId, date, status }));
    applyLocal(entries);
    void commit(entries);
  };

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const exportAs = async (format: 'xlsx' | 'pdf') => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.attendanceExport({ month, format, ...filter });
      if (r.saved) toast(`Puantaj kaydedildi: ${r.path}`);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const [y, m] = month.split('-').map(Number);
  const statuses = useMemo(() => data?.statuses ?? [], [data]);
  const byCode = useMemo(() => toStatusMap(statuses), [statuses]);
  const totals = useMemo(() => new Map(data?.rows.map((r) => [r.employeeId, attendanceTotals(r.cells, byCode)]) ?? []), [data, byCode]);
  const sumWorked = [...totals.values()].reduce((s, t) => s + t.workedDays, 0);
  const sumOtMin = data?.rows.reduce((s, r) => s + r.overtimeMinutes, 0) ?? 0;
  const sumOtKurus = data?.rows.reduce((s, r) => s + r.overtimeKurus, 0) ?? 0;
  // Maaş sütunları: bordro ile aynı kural (shared/payroll.ts)
  const pays = useMemo(() => new Map(data?.rows.map((r) => [r.employeeId, computePay({
    cells: r.cells, statuses: byCode, monthlySalaryKurus: r.monthlySalaryKurus,
    overtimeKurus: r.overtimeKurus, dailyMinWageKurus: data.dailyMinWageKurus,
  })]) ?? []), [data, byCode]);
  const paySum = [...pays.values()].reduce((s, p) => ({ normal: s.normal + p.normalKurus, total: s.total + p.totalKurus, official: s.official + p.officialKurus, cash: s.cash + p.cashKurus }), { normal: 0, total: 0, official: 0, cash: 0 });

  return (
    <div className="select-none">
      <PageHeader
        title="Puantaj"
        description="Üstten bir durum seçin, sonra hücrelere tıklayın veya fareyi basılı tutup sürükleyin. Gün numarasına tıklamak o günü herkese uygular."
        actions={
          <>
            <button className="btn-secondary" onClick={() => void exportAs('xlsx')} disabled={busy}><FileSpreadsheet size={16} /> Excel indir</button>
            <button className="btn-secondary" onClick={() => void exportAs('pdf')} disabled={busy}><FileText size={16} /> PDF indir</button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center overflow-hidden rounded border border-slate-300">
          <button className="bg-surface px-2 py-1.5 hover:bg-slate-50" onClick={() => shiftMonth(-1)} aria-label="Önceki ay"><ChevronLeft size={18} /></button>
          <div className="min-w-36 border-x border-slate-300 bg-surface px-3 py-1.5 text-center font-semibold" data-testid="attendance-month">{MONTH_NAMES[m - 1]} {y}</div>
          <button className="bg-surface px-2 py-1.5 hover:bg-slate-50" onClick={() => shiftMonth(1)} aria-label="Sonraki ay"><ChevronRight size={18} /></button>
        </div>
        <ScopeSelect companies={companies} sites={sites} value={scope} onChange={setScope} />
        <button className="btn-primary" onClick={() => setFillOpen(true)} disabled={!data || data.rows.length === 0}><Wand2 size={16} /> Boş günleri doldur</button>
        <button className="btn-primary" onClick={() => setBulkOpen(true)} disabled={!data || data.rows.length === 0}><Users size={16} /> Toplu puantaj</button>
      </div>

      <div className="card mb-3 flex flex-wrap items-center gap-1.5 px-3 py-2" role="toolbar" aria-label="Puantaj fırçası">
        <span className="mr-1 text-sm font-medium text-slate-600">Fırça:</span>
        {statuses.map((s) => (
          <button
            key={s.code}
            onClick={() => setBrush(s.code)}
            aria-pressed={brush === s.code}
            title={s.label}
            className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${brush === s.code ? 'border-brand-600 ring-2 ring-brand-500' : 'border-slate-300'}`}
          >
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-bold" style={{ background: s.color, color: textColorFor(s.color) }}>{s.short}</span>
            <span className="text-slate-700">{s.label}</span>
          </button>
        ))}
        <button onClick={() => setBrush('overtime')} aria-pressed={brush === 'overtime'} title="Hücreye tıklayınca mesai penceresi açılır; gün numarasına tıklayınca o güne toplu mesai"
          className={`flex items-center gap-1.5 rounded border px-2 py-1 text-xs ${brush === 'overtime' ? 'border-brand-600 ring-2 ring-brand-500' : 'border-slate-300'}`}>
          <span className="inline-flex h-5 items-center justify-center gap-0.5 rounded bg-brand-600 px-1 font-bold text-white"><Clock size={11} />M</span>
          <span className="text-slate-700">Mesai ekle</span>
        </button>
        <button onClick={() => setBrush('erase')} aria-pressed={brush === 'erase'}
          className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${brush === 'erase' ? 'border-brand-600 ring-2 ring-brand-500' : 'border-slate-300'}`}>
          <Eraser size={14} /> Sil
        </button>
        <button onClick={() => setBrushEdit(true)} className="btn-link ml-auto" title="Fırçaların adını, hücre yazısını, rengini ve gün değerini değiştirin; yeni fırça ekleyin">
          <Settings2 size={14} /> Fırçaları düzenle
        </button>
      </div>

      {!data ? <div className="text-slate-500">Yükleniyor…</div> : data.rows.length === 0 ? (
        <div className="card px-4 py-10 text-center text-slate-500">Bu kapsamda çalışan yok. Çalışan ekleyin veya başka şantiye seçin.</div>
      ) : (
        <>
        <GridScroller grid={gridRef} days={data.days} today={today} />
        <div className="card overflow-auto att-grid" ref={gridRef}>
          <table className="border-collapse text-xs" aria-label="Puantaj tablosu">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 min-w-[190px] max-md:min-w-[118px] max-md:max-w-[118px] border border-neutral-700 bg-neutral-900 text-white px-2 py-1 text-left">Çalışan</th>
                {data.days.map((d) => {
                  const dow = parseIsoDate(d).getDay();
                  const weekend = dow === 0 || dow === 6;
                  return (
                    <th key={d} onClick={() => paintColumn(d)} title="Bu güne seçili fırçayı herkese uygula" data-day={d}
                      className={`sticky top-0 z-10 w-8 min-w-8 cursor-pointer border border-neutral-700 px-0 py-1 text-center text-white hover:bg-red-800 ${weekend ? 'bg-neutral-700' : 'bg-neutral-900'} ${d === today ? '!bg-brand-600 !text-white' : ''}`}>
                      <div className="text-[13px] font-bold">{Number(d.slice(8))}</div>
                      <div className="font-normal">{WEEKDAY_SHORT[dow]}</div>
                    </th>
                  );
                })}
                <th className="sticky top-0 z-10 border border-neutral-700 bg-neutral-900 text-white px-1.5" title="Çalışılan gün (yarım gün 0,5)" data-col="totals">Gün</th>
                <th className="sticky top-0 z-10 border border-neutral-700 bg-neutral-900 text-white px-1.5" title="Ücretli + ücretsiz izin">İzin</th>
                <th className="sticky top-0 z-10 border border-neutral-700 bg-neutral-900 text-white px-1.5" title="Raporlu">Rapor</th>
                <th className="sticky top-0 z-10 border border-neutral-700 bg-neutral-900 text-white px-1.5" title="Devamsız">Devamsız</th>
                <th className="sticky top-0 z-10 border border-neutral-700 bg-neutral-900 text-white px-1.5" title="Bu ayki mesai (saat)">Mesai sa.</th>
                <th className="sticky top-0 z-10 border border-neutral-700 bg-neutral-900 text-white px-1.5" title="Bu ayki mesai tutarı">Mesai parası</th>
                <th className="sticky top-0 z-10 border border-neutral-700 bg-neutral-900 text-white px-1.5" title="İşaretlenen günlerin toplamı (fırçaların gün değerine göre)">Ücretli gün</th>
                <th className="sticky top-0 z-10 border border-neutral-700 bg-neutral-900 text-white px-1.5" title="Aylık maaş ÷ 30 × ücretli gün">Normal maaş</th>
                <th className="sticky top-0 z-10 border border-neutral-700 bg-red-700 text-white px-1.5" title="Normal maaş + mesai parası">TOPLAM</th>
                <th className="sticky top-0 z-10 border border-neutral-700 bg-neutral-900 text-white px-1.5" title="Günlük asgari ücret × ücretli gün (resmi / bankaya)">Asgari</th>
                <th className="sticky top-0 z-10 border border-neutral-700 bg-neutral-900 text-white px-1.5" title="Toplam − asgari">Elden</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => {
                const t = totals.get(r.employeeId)!;
                const pay = pays.get(r.employeeId)!;
                return (
                  <tr key={r.employeeId} data-employee={r.fullName}>
                    <td className="sticky left-0 z-10 border border-slate-200 bg-surface px-2 py-1 max-md:max-w-[118px] max-md:[&>div]:truncate">
                      <div className="font-medium">{r.fullName}{r.status === 'left' && <span className="text-slate-400"> (ayrıldı)</span>}</div>
                      <div className="text-[11px] text-slate-500">{r.position}{r.siteName ? ` · ${r.siteName}` : ''}</div>
                    </td>
                    {data.days.map((d) => {
                      const st = r.cells[d];
                      const info = st ? byCode[st] ?? null : null;
                      const dow = parseIsoDate(d).getDay();
                      const ot = r.overtime[d];
                      return (
                        <td
                          key={d}
                          data-cell={`${r.employeeId}:${d}`}
                          onMouseDown={(e) => { e.preventDefault(); startPaint(r.employeeId, d, st); }}
                          onMouseEnter={() => paintCell(r.employeeId, d)}
                          className={`relative h-9 cursor-pointer border border-slate-200 text-center font-bold hover:outline hover:outline-2 hover:outline-brand-500 ${!info && (dow === 0 || dow === 6) ? 'bg-slate-100' : ''}`}
                          style={info ? { background: info.color, color: textColorFor(info.color) } : undefined}
                          title={[info?.label, ot ? `Mesai: ${shortHours(ot)} saat` : ''].filter(Boolean).join(' · ') || undefined}
                        >
                          {info?.short}
                          {ot ? <span data-ot className="absolute right-0 top-0 rounded-bl bg-neutral-950 px-0.5 text-[9px] font-semibold leading-tight text-white ring-1 ring-white/70">{shortHours(ot)}</span> : null}
                        </td>
                      );
                    })}
                    <td className="border border-slate-200 px-1.5 text-center font-bold" data-testid="worked-days">{formatDays(t.workedDays)}</td>
                    <td className="border border-slate-200 px-1.5 text-center">{(t.counts.I ?? 0) + (t.counts.U ?? 0) || ''}</td>
                    <td className="border border-slate-200 px-1.5 text-center">{t.counts.R ?? ''}</td>
                    <td className="border border-slate-200 px-1.5 text-center">{t.counts.D ?? ''}</td>
                    <td className="border border-slate-200 px-1.5 text-center font-semibold" data-testid="ot-hours">{r.overtimeMinutes ? shortHours(r.overtimeMinutes) : ''}</td>
                    <td className="whitespace-nowrap border border-slate-200 px-1.5 text-right tabular-nums" data-testid="ot-amount">{r.overtimeKurus ? money(r.overtimeKurus) : ''}</td>
                    <td className="border border-slate-200 px-1.5 text-center" data-testid="paid-days">{formatDays(pay.paidDays)}</td>
                    <td className="whitespace-nowrap border border-slate-200 px-1.5 text-right tabular-nums">{money(pay.normalKurus)}</td>
                    <td className="whitespace-nowrap border border-slate-200 bg-brand-50 px-1.5 text-right font-bold tabular-nums" data-testid="pay-total">{money(pay.totalKurus)}</td>
                    <td className="whitespace-nowrap border border-slate-200 px-1.5 text-right tabular-nums" data-testid="pay-official">{money(pay.officialKurus)}</td>
                    <td className="whitespace-nowrap border border-slate-200 px-1.5 text-right tabular-nums" data-testid="pay-cash">{money(pay.cashKurus)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky left-0 border border-slate-300 bg-slate-100 px-2 py-1 font-semibold">Toplam ({data.rows.length} çalışan)</td>
                {data.days.map((d) => {
                  const n = data.rows.filter((r) => r.cells[d] === 'X' || r.cells[d] === 'Y').length;
                  return <td key={d} className="border border-slate-300 bg-slate-100 text-center text-[11px] text-slate-600" title="O gün çalışan kişi sayısı">{n || ''}</td>;
                })}
                <td className="border border-slate-300 bg-slate-100 px-1.5 text-center font-bold">{formatDays(sumWorked)}</td>
                <td colSpan={3} className="border border-slate-300 bg-slate-100" />
                <td className="border border-slate-300 bg-slate-100 px-1.5 text-center font-bold">{sumOtMin ? shortHours(sumOtMin) : ''}</td>
                <td className="whitespace-nowrap border border-slate-300 bg-slate-100 px-1.5 text-right font-bold tabular-nums">{sumOtKurus ? money(sumOtKurus) : ''}</td>
                <td className="border border-slate-300 bg-slate-100" />
                <td className="whitespace-nowrap border border-slate-300 bg-slate-100 px-1.5 text-right font-bold tabular-nums">{money(paySum.normal)}</td>
                <td className="whitespace-nowrap border border-slate-300 bg-brand-50 px-1.5 text-right font-bold tabular-nums">{money(paySum.total)}</td>
                <td className="whitespace-nowrap border border-slate-300 bg-slate-100 px-1.5 text-right font-bold tabular-nums">{money(paySum.official)}</td>
                <td className="whitespace-nowrap border border-slate-300 bg-slate-100 px-1.5 text-right font-bold tabular-nums">{money(paySum.cash)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        </>
      )}
      {data && data.dailyMinWageKurus === 0 && (
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Günlük asgari ücret girilmemiş; asgari sütunu 0, toplamın tamamı elden görünür. <b>Ayarlar → Günlük asgari ücret</b> alanından girin.
        </p>
      )}

      {otCell && (
        <CellOvertimeModal row={otCell.row} date={otCell.date} siteId={writeSiteId}
          defaultRateKurus={employees.find((e) => e.id === otCell.row.employeeId)?.overtimeRateKurus ?? 0}
          onClose={() => setOtCell(null)} onChanged={() => void load()} />
      )}
      {otDay && data && (
        <BulkOvertimeForm employees={employees} sites={sites} initialDate={otDay} initialSiteId={writeSiteId ?? null}
          preselectIds={data.rows.map((r) => r.employeeId)} onClose={() => setOtDay(null)} onSaved={() => void load()} />
      )}
      {brushEdit && <BrushEditor statuses={statuses} onClose={() => setBrushEdit(false)} onChanged={() => void load()} />}
      {fillOpen && data && (
        <FillModal month={month} employeeIds={data.rows.filter((r) => r.status === 'active').map((r) => r.employeeId)} siteId={writeSiteId}
          onClose={() => setFillOpen(false)} onDone={() => void load()} />
      )}
      {bulkOpen && data && (
        <BulkAttendanceForm rows={data.rows} days={data.days} statuses={statuses} today={today} siteId={writeSiteId}
          onClose={() => setBulkOpen(false)} onDone={() => { setBulkOpen(false); void load(); }} />
      )}
    </div>
  );
}

/** Puantaj tablosunun üstündeki gezinme: hafta düğmeleri ve tutup çekilen kaydırma çubuğu. */
function GridScroller({ grid, days, today }: { grid: React.RefObject<HTMLDivElement | null>; days: string[]; today: string }) {
  const [pos, setPos] = useState({ left: 0, max: 0 });
  const month = days[0]?.slice(0, 7) ?? '';
  const hasToday = days.includes(today);

  // Bir sütunu, sabit duran "Çalışan" sütununun hemen sağına getirir.
  const goTo = useCallback((selector: string, smooth = true) => {
    const el = grid.current;
    const th = el?.querySelector<HTMLElement>(selector);
    const first = el?.querySelector<HTMLElement>('thead th');
    if (!el || !th || !first) return;
    el.scrollTo({ left: Math.max(0, th.offsetLeft - first.offsetWidth), behavior: smooth ? 'smooth' : 'auto' });
  }, [grid]);

  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const sync = () => setPos({ left: el.scrollLeft, max: Math.max(0, el.scrollWidth - el.clientWidth) });
    sync();
    el.addEventListener('scroll', sync, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', sync);
      ro.disconnect();
    };
  }, [grid, month]);

  // Ay açılınca bugünün birkaç gün öncesinden başlat (bu ay değilse en baştan).
  useEffect(() => {
    if (hasToday) goTo(`th[data-day="${month}-${String(Math.max(1, Number(today.slice(8)) - 2)).padStart(2, '0')}"]`, false);
    else grid.current?.scrollTo({ left: 0 });
  }, [month, hasToday, today, goTo, grid]);

  if (pos.max <= 0) return null;
  const weeks: [number, number][] = [];
  for (let d = 1; d <= days.length; d += 7) weeks.push([d, Math.min(d + 6, days.length)]);
  const chip = 'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium';
  const idle = 'border-slate-300 bg-surface text-slate-700 hover:border-red-600';
  return (
    <div className="card mb-2 px-3 py-2" data-testid="grid-scroller">
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <span className="shrink-0 text-xs text-slate-500">Git:</span>
        {hasToday && <button type="button" className={`${chip} border-brand-600 bg-brand-600 text-white`} onClick={() => goTo(`th[data-day="${today}"]`)}>Bugün</button>}
        {weeks.map(([a, b]) => (
          <button key={a} type="button" className={`${chip} ${idle}`} onClick={() => goTo(`th[data-day="${month}-${String(a).padStart(2, '0')}"]`)}>
            {a === b ? a : `${a}–${b}`}
          </button>
        ))}
        <button type="button" className={`${chip} ${idle}`} onClick={() => goTo('th[data-col="totals"]')}>Toplamlar</button>
      </div>
      <input type="range" className="grid-slider" aria-label="Tabloyu yana kaydır" min={0} max={pos.max} step={1} value={Math.min(pos.left, pos.max)}
        onChange={(e) => grid.current?.scrollTo({ left: Number(e.target.value) })} />
    </div>
  );
}

function FillModal({ month, employeeIds, siteId, onClose, onDone }: {
  month: string; employeeIds: number[]; siteId?: number; onClose: () => void; onDone: () => void;
}) {
  const { toast, showError } = useApp();
  const [workSaturday, setWorkSaturday] = useState(true);
  const [untilToday, setUntilToday] = useState(true);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api.attendanceFill({ month, employeeIds, workSaturday, untilToday, siteId });
      toast(r.changed ? `${r.changed} hücre dolduruldu.` : 'Doldurulacak boş gün yok.');
      onDone();
      onClose();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Boş günleri doldur" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Vazgeç</button><button className="btn-primary" onClick={() => void run()} disabled={busy}>Doldur</button></>}>
      <p className="mb-3 text-sm text-slate-700">
        Listedeki <b>{employeeIds.length} aktif çalışanın</b> boş günleri doldurulur: iş günleri <b>X (Çalıştı)</b>, tatil günleri <b>H (Hafta tatili)</b>.
        Daha önce işaretlediğiniz izin, rapor gibi günler <b>değiştirilmez</b>. İşe başlama tarihinden önceki günler boş kalır.
      </p>
      <label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" name="workSaturday" checked={workSaturday} onChange={(e) => setWorkSaturday(e.target.checked)} /> Cumartesi çalışılıyor</label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="untilToday" checked={untilToday} onChange={(e) => setUntilToday(e.target.checked)} /> Yalnızca bugüne kadar olan günleri doldur</label>
    </Modal>
  );
}

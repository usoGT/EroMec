// Takvim: her günün mesai, gider ve günlük rapor özeti. Güne tıklayınca ayrıntılar açılır.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import type { CalendarDay, Employee } from '../../shared/types';
import { addDays, MONTH_NAMES, monthRange, parseIsoDate, todayIso } from '../../shared/dates';
import { formatMinutes } from '../../shared/overtime';
import { api } from '../lib/api';
import { useApp } from '../lib/context';
import { scopeToFilter, useSites } from '../lib/useSites';
import PageHeader from '../components/PageHeader';
import { ScopeSelect } from '../components/SiteSelect';
import DayDetailModal from './DayDetailModal';

const WEEKDAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];

/** Para tutarını takvim hücresi için kısaltır: 12.500 ₺ */
const shortMoney = (k: number, sym: string) => `${Math.round(k / 100).toLocaleString('tr-TR')} ${sym}`;

export default function CalendarPage() {
  const { symbol, showError } = useApp();
  const { companies, sites } = useSites();
  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7)); // "YYYY-AA"
  const [scope, setScope] = useState('');
  const [days, setDays] = useState<Map<string, CalendarDay>>(new Map());
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [openDate, setOpenDate] = useState<string | null>(null);

  const range = useMemo(() => monthRange(`${month}-01`), [month]);

  const load = useCallback(async () => {
    try {
      const [list, emps] = await Promise.all([api.calendarMonth({ ...range, ...scopeToFilter(scope) }), api.employeesList()]);
      setDays(new Map(list.map((d) => [d.date, d])));
      setEmployees(emps);
    } catch (e) {
      showError(e);
    }
  }, [range, scope, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  // Ay ızgarası: pazartesiden başlayan haftalar
  const cells = useMemo(() => {
    const first = range.from;
    const offset = (parseIsoDate(first).getDay() + 6) % 7;
    const start = addDays(first, -offset);
    const lastOffset = 6 - ((parseIsoDate(range.to).getDay() + 6) % 7);
    const end = addDays(range.to, lastOffset);
    const out: string[] = [];
    for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
    return out;
  }, [range]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const [y, m] = month.split('-').map(Number);
  const totals = [...days.values()].reduce(
    (s, d) => ({ minutes: s.minutes + d.overtimeMinutes, ot: s.ot + d.overtimeKurus, ex: s.ex + d.expenseKurus, rp: s.rp + d.reportCount }),
    { minutes: 0, ot: 0, ex: 0, rp: 0 },
  );

  return (
    <div>
      <PageHeader title="Takvim" description="Bir güne tıklayarak o günün mesailerini, giderlerini ve günlük raporlarını görün veya ekleyin." />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center overflow-hidden rounded border border-slate-300">
          <button className="bg-surface px-2 py-1.5 hover:bg-slate-50" onClick={() => shiftMonth(-1)} aria-label="Önceki ay"><ChevronLeft size={18} /></button>
          <div className="min-w-40 border-x border-slate-300 bg-surface px-3 py-1.5 text-center font-semibold" data-testid="calendar-month">{MONTH_NAMES[m - 1]} {y}</div>
          <button className="bg-surface px-2 py-1.5 hover:bg-slate-50" onClick={() => shiftMonth(1)} aria-label="Sonraki ay"><ChevronRight size={18} /></button>
        </div>
        <button className="btn-secondary" onClick={() => setMonth(today.slice(0, 7))}>Bugün</button>
        <ScopeSelect companies={companies} sites={sites} value={scope} onChange={setScope} />
        <div className="ml-auto text-sm text-slate-600">
          Ay toplamı: mesai <b>{formatMinutes(totals.minutes)}</b> · <b>{shortMoney(totals.ot, symbol)}</b> · gider <b>{shortMoney(totals.ex, symbol)}</b> · {totals.rp} rapor
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="grid grid-cols-7 border-b-2 border-red-600 bg-neutral-900 text-center text-sm font-semibold text-white">
          {WEEKDAYS.map((w) => <div key={w} className="py-1.5"><span className="md:hidden">{w.slice(0, 3)}</span><span className="max-md:hidden">{w}</span></div>)}
        </div>
        <div className="grid grid-cols-7" role="grid" aria-label="Takvim">
          {cells.map((d) => {
            const info = days.get(d);
            const inMonth = d.startsWith(month);
            const isToday = d === today;
            return (
              <button
                key={d}
                role="gridcell"
                data-date={d}
                onClick={() => setOpenDate(d)}
                className={`flex min-h-[92px] flex-col items-stretch gap-0.5 border-b border-r border-slate-200 p-1.5 text-left text-xs hover:bg-brand-50 ${inMonth ? 'bg-surface' : 'bg-slate-50 text-slate-400'}`}
              >
                <span className={`mb-0.5 inline-flex h-6 w-6 items-center justify-center self-start rounded-full text-sm ${isToday ? 'bg-brand-600 font-bold text-white' : 'font-medium'}`}>
                  {Number(d.slice(8))}
                </span>
                {info && info.overtimeCount > 0 && (
                  <span className="truncate rounded bg-brand-50 px-1 text-brand-700" title="Mesai">⏱ {formatMinutes(info.overtimeMinutes)} · {shortMoney(info.overtimeKurus, symbol)}</span>
                )}
                {info && info.expenseCount > 0 && (
                  <span className="truncate rounded bg-amber-50 px-1 text-amber-800" title="Gider">₺ {shortMoney(info.expenseKurus, symbol)} ({info.expenseCount})</span>
                )}
                {info && info.reportCount > 0 && (
                  <span className="inline-flex items-center gap-1 truncate rounded bg-green-50 px-1 text-green-800" title="Günlük rapor"><FileText size={11} /> {info.reportCount} rapor</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">Takvimdeki gider tutarı, “Ek mesai” kategorisindeki ödeme kayıtlarını içermez (mesai tutarı ayrı gösterilir).</p>

      {openDate && (
        <DayDetailModal date={openDate} scope={scope} employees={employees} sites={sites}
          onClose={() => setOpenDate(null)} onChanged={() => void load()} />
      )}
    </div>
  );
}

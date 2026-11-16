// Ana sayfa: özet kartları, hızlı işlemler, bugünkü puantaj, bu ayın bordrosu, ödenmemiş giderler, şantiyeler, son işlemler.
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle, Banknote, CalendarDays, CalendarRange, Check, ClipboardCheck, Clock, FileText, HardHat, Receipt, Sigma, Users, Wallet,
} from 'lucide-react';
import { scopeToFilter, useSites } from '../lib/useSites';
import { ScopeSelect } from '../components/SiteSelect';
import type { AttendanceMonth, Category, Dashboard, Employee, Expense, PayrollMonth, Site, Summary } from '../../shared/types';
import { formatDate, formatDateTime, monthRange, todayIso, MONTH_NAMES } from '../../shared/dates';
import { formatMinutes } from '../../shared/overtime';
import { textColorFor, toStatusMap } from '../../shared/attendance';
import { api } from '../lib/api';
import { useApp } from '../lib/context';
import PageHeader from '../components/PageHeader';
import StatCard from '../components/StatCard';
import BulkOvertimeForm from './BulkOvertimeForm';
import OvertimeForm from './OvertimeForm';
import ExpenseForm from './ExpenseForm';
import type { PageId } from '../App';

const ENTITY_LABEL: Record<string, string> = {
  employee: 'Çalışan', overtime: 'Mesai', expense: 'Gider', settings: 'Ayarlar', backup: 'Yedek', site: 'Şantiye', report: 'Günlük rapor', attendance: 'Puantaj',
};

interface Extra {
  attendance: AttendanceMonth;
  payroll: PayrollMonth;
  unpaid: Expense[];
  employees: Employee[];
  sites: Site[];
  categories: Category[];
  siteMonth: { site: Site; sum: Summary }[];
}

function Panel({ title, icon, action, children, testId }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; testId?: string }) {
  return (
    <div className="card flex flex-col px-4 py-3" data-testid={testId}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-brand-500">{icon}</span>
        <h2 className="font-semibold">{title}</h2>
        <span className="ml-auto">{action}</span>
      </div>
      {children}
    </div>
  );
}

/** Ana sayfada seçilen firma/şantiye bu cihazda hatırlanır */
const SCOPE_KEY = 'puanto.dashboardScope';
const readScope = () => {
  try {
    return localStorage.getItem(SCOPE_KEY) ?? '';
  } catch {
    return '';
  }
};

export default function DashboardPage({ onNavigate }: { onNavigate: (p: PageId) => void }) {
  const { money, toast, showError } = useApp();
  const { companies, sites: allSites } = useSites();
  const [scope, setScopeState] = useState(readScope);
  const [data, setData] = useState<Dashboard | null>(null);
  const [x, setX] = useState<Extra | null>(null);
  const [open, setOpen] = useState<'bulk' | 'overtime' | 'expense' | null>(null);
  const today = todayIso();
  const month = today.slice(0, 7);

  const setScope = (v: string) => {
    setScopeState(v);
    try {
      localStorage.setItem(SCOPE_KEY, v);
    } catch {
      /* depolama kapalıysa yalnızca bu oturumda geçerli */
    }
  };

  const load = useCallback(async () => {
    try {
      const f = scopeToFilter(scope);
      const [d, attendance, payroll, unpaid, employees, sites, categories] = await Promise.all([
        api.dashboard({ today, ...f }), api.attendanceMonth({ month, ...f }), api.payrollMonth({ month, ...f }), api.expensesList({ paid: 'unpaid', ...f }),
        api.employeesList(), api.sitesList(), api.categoriesList(),
      ]);
      const m = monthRange(today);
      // Şantiye tablosu da seçime uyar: firma seçildiyse o firmanın, şantiye seçildiyse yalnızca o şantiye
      const active = sites.filter((s) => s.status === 'active' && (!f.siteId || s.id === f.siteId) && (!f.companyId || s.companyId === f.companyId)).slice(0, 6);
      const sums = await Promise.all(active.map((s) => api.summary({ ...m, siteId: s.id })));
      setData(d);
      setX({ attendance, payroll, unpaid, employees, sites, categories, siteMonth: active.map((site, i) => ({ site, sum: sums[i] })) });
    } catch (e) {
      showError(e);
    }
  }, [today, month, scope, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data || !x) return <div className="text-slate-500">Yükleniyor…</div>;

  const f = scopeToFilter(scope);
  const scopeLabel = f.siteId ? allSites.find((s) => s.id === f.siteId)?.name
    : f.companyId ? `${companies.find((c) => c.id === f.companyId)?.name ?? ''} (bütün şantiyeleri)` : '';

  // Bugünkü puantaj
  const statusMap = toStatusMap(x.attendance.statuses);
  const activeRows = x.attendance.rows.filter((r) => r.status === 'active');
  const unmarked = activeRows.filter((r) => !r.cells[today]);
  const todayCounts = new Map<string, number>();
  for (const r of activeRows) if (r.cells[today]) todayCounts.set(r.cells[today], (todayCounts.get(r.cells[today]) ?? 0) + 1);
  const markRest = async () => {
    try {
      await api.attendanceSet({ entries: unmarked.map((r) => ({ employeeId: r.employeeId, date: today, status: 'X' })) });
      toast(`${unmarked.length} çalışan bugün için “${statusMap.X?.short ?? 'X'} — ${statusMap.X?.label ?? 'Çalıştı'}” işaretlendi.`);
      await load();
    } catch (e) {
      showError(e);
    }
  };

  // Bu ayın bordrosu
  const pr = x.payroll.rows.reduce((s, r) => {
    const v = r.saved ?? r.live;
    return { total: s.total + v.totalKurus, official: s.official + v.officialKurus, cash: s.cash + v.cashKurus, saved: s.saved + (r.saved ? 1 : 0), pending: s.pending + (!r.saved && r.live.normalKurus > 0 ? 1 : 0) };
  }, { total: 0, official: 0, cash: 0, saved: 0, pending: 0 });

  const markPaid = async (e: Expense) => {
    try {
      await api.expenseUpdate({ id: e.id, input: { date: e.date, name: e.name, categoryId: e.categoryId, amountKurus: e.amountKurus, isPaid: true, description: e.description, siteId: e.siteId } });
      toast(`“${e.name}” ödendi olarak işaretlendi.`);
      await load();
    } catch (err) {
      showError(err);
    }
  };

  return (
    <div>
      <PageHeader title="Ana Sayfa" description={`Bugün: ${formatDate(data.today)}${scopeLabel ? ` · ${scopeLabel}` : ''}`}
        actions={<ScopeSelect companies={companies} sites={allSites} value={scope} onChange={setScope} className="input w-72 max-md:w-full" />} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" data-testid="dashboard-cards">
        <StatCard label="Toplam çalışan" icon={<Users size={18} />} value={data.activeEmployeeCount} hint={`Aktif çalışan · kayıtlı toplam ${data.totalEmployeeCount}`} />
        <StatCard label="Bugünkü maliyet" icon={<Receipt size={18} />} value={money(data.todayTotalKurus)} hint="Puantaj + mesai + diğer" />
        <StatCard label="Bu haftaki maliyet" icon={<CalendarRange size={18} />} value={money(data.weekTotalKurus)} hint="Pazartesi – Pazar" />
        <StatCard label="Bu ayki maliyet" icon={<CalendarDays size={18} />} value={money(data.monthTotalKurus)} hint="Puantaj + mesai + diğer" />
        <StatCard label="Toplam maliyet" icon={<Sigma size={18} />} value={money(data.allTimeTotalKurus)} hint="Şimdiye kadarki bütün kayıtlar" />
        <StatCard label="Ödenmemiş borç" icon={<AlertCircle size={18} />} value={money(data.totalUnpaidKurus)} hint="Tüm ödenmemiş giderler" tone={data.totalUnpaidKurus > 0 ? 'warn' : 'default'} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2" aria-label="Hızlı işlemler">
        <button className="btn-primary" onClick={() => setOpen('bulk')}><Users size={15} /> Toplu mesai</button>
        <button className="btn-secondary" onClick={() => setOpen('overtime')}><Clock size={15} /> Mesai ekle</button>
        <button className="btn-secondary" onClick={() => setOpen('expense')}><Wallet size={15} /> Gider ekle</button>
        <button className="btn-secondary" onClick={() => onNavigate('attendance')}><ClipboardCheck size={15} /> Puantaj</button>
        <button className="btn-secondary" onClick={() => onNavigate('calendar')}><FileText size={15} /> Günlük rapor yaz</button>
        <button className="btn-secondary" onClick={() => onNavigate('payroll')}><Banknote size={15} /> Bordro</button>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Panel title="Bugünkü puantaj" icon={<ClipboardCheck size={17} />} testId="today-attendance"
          action={<button className="btn-link" onClick={() => onNavigate('attendance')}>Puantaja git</button>}>
          {activeRows.length === 0 ? <p className="text-sm text-slate-500">Aktif çalışan yok.</p> : (
            <>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {[...todayCounts.entries()].map(([code, n]) => {
                  const st = statusMap[code];
                  return st ? (
                    <span key={code} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-semibold" style={{ background: st.color, color: textColorFor(st.color) }}>
                      {st.short} · {st.label}: {n}
                    </span>
                  ) : null;
                })}
                {todayCounts.size === 0 && <span className="text-sm text-slate-500">Bugün için henüz işaretleme yapılmadı.</span>}
              </div>
              {unmarked.length > 0 ? (
                <>
                  <p className="text-sm text-slate-700"><b>{unmarked.length}</b> / {activeRows.length} çalışan işaretlenmedi:</p>
                  <p className="mb-2 truncate text-xs text-slate-500" title={unmarked.map((r) => r.fullName).join(', ')}>{unmarked.slice(0, 6).map((r) => r.fullName).join(', ')}{unmarked.length > 6 ? '…' : ''}</p>
                  <button className="btn-primary self-start" onClick={() => void markRest()}><Check size={15} /> Kalanları “{statusMap.X?.short ?? 'X'}” işaretle</button>
                </>
              ) : <p className="text-sm text-green-700">Bütün aktif çalışanlar bugün için işaretlendi.</p>}
            </>
          )}
        </Panel>

        <Panel title={`${MONTH_NAMES[Number(month.slice(5)) - 1]} bordrosu`} icon={<Banknote size={17} />} testId="month-payroll"
          action={<button className="btn-link" onClick={() => onNavigate('payroll')}>Bordroya git</button>}>
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="py-0.5 text-slate-600">Toplam maaş (mesai dahil)</td><td className="text-right font-bold tabular-nums">{money(pr.total)}</td></tr>
              <tr><td className="py-0.5 text-slate-600">Asgari (resmi)</td><td className="text-right tabular-nums">{money(pr.official)}</td></tr>
              <tr><td className="py-0.5 text-slate-600">Elden</td><td className="text-right tabular-nums">{money(pr.cash)}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">
            {pr.saved} çalışanın bordrosu kaydedildi{pr.pending > 0 ? <>, <b className="text-amber-700">{pr.pending} çalışanınki bekliyor</b></> : ''}. Puantaj ve mesailerden anlık hesaplanır.
          </p>
        </Panel>

        <Panel title="Ödenmemiş giderler" icon={<AlertCircle size={17} />} testId="unpaid-expenses"
          action={<button className="btn-link" onClick={() => onNavigate('expenses')}>Giderlere git</button>}>
          {x.unpaid.length === 0 ? <p className="text-sm text-green-700">Ödenmemiş gider yok.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {x.unpaid.slice(0, 5).map((e) => (
                <li key={e.id} className="flex items-center gap-2 py-1">
                  <span className="min-w-0 flex-1 truncate" title={e.name}>{e.name}<span className="ml-1 text-xs text-slate-500">{formatDate(e.date)}</span></span>
                  <span className="tabular-nums">{money(e.amountKurus)}</span>
                  <button className="btn-link" onClick={() => void markPaid(e)} title="Ödendi olarak işaretle"><Check size={13} /> Ödendi</button>
                </li>
              ))}
              {x.unpaid.length > 5 && <li className="py-1 text-xs text-slate-500">+{x.unpaid.length - 5} gider daha</li>}
            </ul>
          )}
        </Panel>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Panel title="Şantiyeler — bu ay" icon={<HardHat size={17} />} action={<button className="btn-link" onClick={() => onNavigate('sites')}>Şantiyelere git</button>}>
          {x.siteMonth.length === 0 ? <p className="text-sm text-slate-500">Devam eden şantiye yok.</p> : (
            <table className="w-full text-sm" aria-label="Şantiye özetleri">
              <thead><tr className="text-left text-xs text-slate-500"><th className="font-medium">Şantiye</th><th className="text-right font-medium">Çalışan</th><th className="text-right font-medium">Mesai</th><th className="text-right font-medium">Toplam gider</th></tr></thead>
              <tbody>
                {x.siteMonth.map(({ site, sum }) => (
                  <tr key={site.id} className="border-t border-slate-100">
                    <td className="py-1"><span className="font-medium">{site.name}</span> <span className="text-xs text-slate-500">{site.companyName}</span></td>
                    <td className="text-right">{site.employeeCount}</td>
                    <td className="text-right">{formatMinutes(sum.overtimeMinutes)}</td>
                    <td className="text-right font-semibold tabular-nums">{money(sum.totalKurus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="Son işlemler" icon={<FileText size={17} />}>
          {data.recent.length === 0 ? <p className="text-sm text-slate-500">Henüz bir işlem yapılmadı.</p> : (
            <ul className="text-xs" aria-label="Son işlemler">
              {data.recent.slice(0, 6).map((r) => (
                <li key={r.id} className="flex gap-2 border-t border-slate-100 py-1 first:border-t-0">
                  <span className="w-28 shrink-0 text-slate-500">{formatDateTime(r.createdAt)}</span>
                  <span className="w-20 shrink-0 font-medium text-slate-600">{ENTITY_LABEL[r.entity] ?? r.entity}</span>
                  <span className="truncate" title={r.summary}>{r.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Maliyet = puantajdan personel maliyeti (aylık maaş ÷ 30 × işaretli gün) + mesai kayıtları + diğer giderler. Kaydedilen ödemelerle karşılaştırma için Raporlar sayfasına bakın.
      </p>

      {open === 'bulk' && <BulkOvertimeForm employees={x.employees} sites={x.sites} initialDate={today} onClose={() => setOpen(null)} onSaved={() => void load()} />}
      {open === 'overtime' && <OvertimeForm employees={x.employees} sites={x.sites} initialDate={today} onClose={() => setOpen(null)} onSaved={() => void load()} />}
      {open === 'expense' && <ExpenseForm categories={x.categories} sites={x.sites} initialDate={today} onClose={() => setOpen(null)} onSaved={() => void load()} />}
    </div>
  );
}

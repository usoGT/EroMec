import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import type { Employee, OvertimeInput, OvertimeRecord, OvertimeTotals } from '../../shared/types';
import { formatDate, monthRange, todayIso } from '../../shared/dates';
import { formatHoursDecimal, formatMinutes } from '../../shared/overtime';
import { api } from '../lib/api';
import { useApp } from '../lib/context';
import PageHeader from '../components/PageHeader';
import DataTable, { type Column } from '../components/DataTable';
import DateRangeFilter, { type Range } from '../components/DateRangeFilter';
import OvertimeForm from './OvertimeForm';
import BulkOvertimeForm from './BulkOvertimeForm';
import { ScopeSelect } from '../components/SiteSelect';
import { scopeToFilter, useSites } from '../lib/useSites';

const toInput = (r: OvertimeRecord): OvertimeInput => ({
  employeeId: r.employeeId, siteId: r.siteId, date: r.date, startTime: r.startTime, endTime: r.endTime,
  breakMinutes: r.breakMinutes, hourlyRateKurus: r.hourlyRateKurus, description: r.description,
});

export default function OvertimePage() {
  const { money, toast, confirm, showError } = useApp();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [rows, setRows] = useState<OvertimeRecord[]>([]);
  const [totals, setTotals] = useState<OvertimeTotals | null>(null);
  const [range, setRange] = useState<Range>(monthRange(todayIso()));
  const [employeeId, setEmployeeId] = useState(0);
  const [editing, setEditing] = useState<OvertimeRecord | 'new' | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [scope, setScope] = useState('');
  const { companies, sites } = useSites();
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const filter = { from: range.from || undefined, to: range.to || undefined, employeeId: employeeId || undefined, ...scopeToFilter(scope) };
      const [emps, list, t] = await Promise.all([
        api.employeesList(), api.overtimeList(filter), api.overtimeTotals({ today: todayIso(), filter }),
      ]);
      setEmployees(emps);
      setRows(list);
      setTotals(t);
      setLoaded(true);
    } catch (e) {
      showError(e);
    }
  }, [range, employeeId, scope, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (r: OvertimeRecord, change: Partial<OvertimeInput>) => {
    await api.overtimeUpdate({ id: r.id, input: { ...toInput(r), ...change } });
    toast('Mesai kaydı güncellendi.');
    await load();
  };

  const remove = async (r: OvertimeRecord) => {
    const ok = await confirm({
      title: 'Mesai kaydını sil',
      message: <><b>{r.employeeName}</b> — {formatDate(r.date)} {r.startTime}–{r.endTime} ({money(r.totalKurus)}) kaydı silinsin mi?</>,
      confirmText: 'Sil',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.overtimeDelete(r.id);
      toast('Mesai kaydı silindi.');
      await load();
    } catch (e) {
      showError(e);
    }
  };

  const columns: Column<OvertimeRecord>[] = [
    { key: 'employee', header: 'Çalışan', sortValue: (r) => r.employeeName, render: (r) => <span className="font-medium">{r.employeeName}</span> },
    {
      key: 'site', header: 'Şantiye', sortValue: (r) => r.siteName, render: (r) => r.siteName ?? <span className="text-slate-400">—</span>,
      edit: {
        type: 'select', value: (r) => String(r.siteId ?? 0),
        options: [{ value: '0', label: '— Şantiye yok —' }, ...sites.map((s) => ({ value: String(s.id), label: `${s.companyName} / ${s.name}` }))],
        save: (r, v) => patch(r, { siteId: Number(v) || null }),
      },
    },
    {
      key: 'date', header: 'Tarih', width: '110px', sortValue: (r) => r.date, render: (r) => formatDate(r.date),
      edit: { type: 'date', value: (r) => r.date, save: (r, v) => patch(r, { date: String(v) }) },
    },
    {
      key: 'start', header: 'Başlangıç', width: '90px', sortValue: (r) => r.startTime, render: (r) => r.startTime,
      edit: { type: 'time', value: (r) => r.startTime, save: (r, v) => patch(r, { startTime: String(v) }) },
    },
    {
      key: 'end', header: 'Bitiş', width: '100px', sortValue: (r) => r.endTime,
      render: (r) => <>{r.endTime}{r.endTime < r.startTime && <span className="ml-1 text-xs text-amber-700" title="Ertesi gün">(+1)</span>}</>,
      edit: { type: 'time', value: (r) => r.endTime, save: (r, v) => patch(r, { endTime: String(v) }) },
    },
    {
      key: 'break', header: 'Mola (dk)', width: '80px', align: 'right', sortValue: (r) => r.breakMinutes, render: (r) => r.breakMinutes,
      edit: { type: 'integer', value: (r) => r.breakMinutes, save: (r, v) => patch(r, { breakMinutes: Number(v) }) },
    },
    {
      key: 'worked', header: 'Toplam saat', width: '100px', align: 'right', sortValue: (r) => r.workedMinutes,
      render: (r) => <span title={formatMinutes(r.workedMinutes)}>{formatHoursDecimal(r.workedMinutes)}</span>,
    },
    {
      key: 'rate', header: 'Saatlik ücret', width: '120px', align: 'right', sortValue: (r) => r.hourlyRateKurus, render: (r) => money(r.hourlyRateKurus),
      edit: { type: 'money', value: (r) => r.hourlyRateKurus, save: (r, v) => patch(r, { hourlyRateKurus: Number(v) }) },
    },
    { key: 'total', header: 'Toplam tutar', width: '130px', align: 'right', sortValue: (r) => r.totalKurus, render: (r) => <b>{money(r.totalKurus)}</b> },
    {
      key: 'desc', header: 'Açıklama', sortValue: (r) => r.description, render: (r) => r.description,
      edit: { type: 'text', value: (r) => r.description, save: (r, v) => patch(r, { description: String(v) }) },
    },
    {
      key: 'actions', header: 'İşlemler', width: '150px',
      render: (r) => (
        <div className="flex gap-1">
          <button className="btn-link" onClick={() => setEditing(r)}><Pencil size={14} /> Düzenle</button>
          <button className="btn-link-danger" onClick={() => void remove(r)}><Trash2 size={14} /> Sil</button>
        </div>
      ),
    },
  ];

  const totalBox = (label: string, minutes: number, kurus: number) => (
    <div className="card px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold tabular-nums">{formatMinutes(minutes)} · {money(kurus)}</div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Mesailer"
        description="Toplam saat = bitiş − başlangıç − mola. Tutar = saat × saatlik ücret. Hücrelere tıklayarak düzenleyebilirsiniz."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setBulkOpen(true)}><Users size={16} /> Toplu mesai</button>
            <button className="btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> Yeni mesai</button>
          </>
        }
      />
      {totals && (
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="overtime-totals">
          {totalBox('Bugün', totals.dayMinutes, totals.dayKurus)}
          {totalBox('Bu hafta (Pzt–Paz)', totals.weekMinutes, totals.weekKurus)}
          {totalBox('Bu ay', totals.monthMinutes, totals.monthKurus)}
          {totalBox('Filtrelenen kayıtlar', totals.filteredMinutes, totals.filteredKurus)}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <DateRangeFilter value={range} onChange={setRange} />
        <select className="input w-56" value={employeeId} onChange={(e) => setEmployeeId(Number(e.target.value))} aria-label="Çalışana göre filtre">
          <option value={0}>Tüm çalışanlar</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}{e.status === 'left' ? ' (ayrıldı)' : ''}</option>)}
        </select>
        <ScopeSelect companies={companies} sites={sites} value={scope} onChange={setScope} />
      </div>
      <DataTable
        label="Mesailer"
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onError={showError}
        defaultSort={{ key: 'date', dir: 'desc' }}
        emptyText={!loaded ? 'Yükleniyor…' : 'Seçilen tarih aralığında mesai kaydı yok. “Yeni mesai” ile ekleyebilirsiniz.'}
        footer={
          <tr>
            <td colSpan={6}>{rows.length} kayıt</td>
            <td className="text-right tabular-nums">{formatHoursDecimal(rows.reduce((s, r) => s + r.workedMinutes, 0))}</td>
            <td />
            <td className="text-right tabular-nums">{money(rows.reduce((s, r) => s + r.totalKurus, 0))}</td>
            <td colSpan={2} />
          </tr>
        }
      />
      {editing && <OvertimeForm record={editing === 'new' ? undefined : editing} employees={employees} sites={sites} onClose={() => setEditing(null)} onSaved={load} />}
      {bulkOpen && <BulkOvertimeForm employees={employees} sites={sites} initialSiteId={scopeToFilter(scope).siteId} onClose={() => setBulkOpen(false)} onSaved={load} />}
    </div>
  );
}

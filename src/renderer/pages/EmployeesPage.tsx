import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import type { Employee, EmployeeInput } from '../../shared/types';
import { formatDate } from '../../shared/dates';
import { api } from '../lib/api';
import { useApp } from '../lib/context';
import PageHeader from '../components/PageHeader';
import DataTable, { type Column } from '../components/DataTable';
import EmployeeForm from './EmployeeForm';
import EmployeeDetailModal from './EmployeeDetailModal';
import StatusBadge from '../components/StatusBadge';
import { ScopeSelect } from '../components/SiteSelect';
import { scopeToFilter, useSites } from '../lib/useSites';

type StatusFilter = 'all' | 'active' | 'left';

const toInput = (e: Employee): EmployeeInput => ({
  fullName: e.fullName, position: e.position, monthlySalaryKurus: e.monthlySalaryKurus, overtimeRateKurus: e.overtimeRateKurus,
  startDate: e.startDate, status: e.status, phone: e.phone, notes: e.notes, siteId: e.siteId, nationalId: e.nationalId,
  iban: e.iban, bankName: e.bankName, birthDate: e.birthDate, address: e.address, bloodType: e.bloodType,
  emergencyName: e.emergencyName, emergencyPhone: e.emergencyPhone, sgkNo: e.sgkNo,
});

export default function EmployeesPage() {
  const { money, toast, confirm, showError } = useApp();
  const [rows, setRows] = useState<Employee[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [editing, setEditing] = useState<Employee | 'new' | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [scope, setScope] = useState('');
  const { companies, sites, reload: reloadSites } = useSites();

  const load = useCallback(async () => {
    try {
      setRows(await api.employeesList());
      setLoaded(true);
    } catch (e) {
      showError(e);
    }
  }, [showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    const sf = scopeToFilter(scope);
    const siteOk = (r: Employee) =>
      sf.siteId ? r.siteId === sf.siteId : sf.companyId ? sites.some((s) => s.id === r.siteId && s.companyId === sf.companyId) : true;
    return rows.filter(
      (r) =>
        (status === 'all' || r.status === status) && siteOk(r) &&
        (!q || `${r.employeeNo} ${r.fullName} ${r.position} ${r.phone} ${r.nationalId} ${r.siteName ?? ''}`.toLocaleLowerCase('tr-TR').includes(q)),
    );
  }, [rows, search, status, scope, sites]);

  const patch = async (e: Employee, change: Partial<EmployeeInput>) => {
    await api.employeeUpdate({ id: e.id, input: { ...toInput(e), ...change } });
    toast('Kaydedildi.');
    await load();
    void reloadSites();
  };

  const remove = async (e: Employee) => {
    const ok = await confirm({
      title: 'Çalışanı sil',
      message: <>“<b>{e.fullName}</b>” silinsin mi? Bu işlem geri alınamaz.</>,
      confirmText: 'Sil',
      danger: true,
    });
    if (!ok) return;
    try {
      const r = await api.employeeDelete(e.id);
      if (r.deleted) {
        toast(`${e.fullName} silindi.`);
      } else if (e.status === 'active') {
        const mark = await confirm({ title: 'Çalışan silinemez', message: r.reason, confirmText: 'Ayrıldı olarak işaretle' });
        if (mark) {
          await api.employeeSetStatus({ id: e.id, status: 'left' });
          toast(`${e.fullName} “Ayrıldı” olarak işaretlendi. Geçmiş kayıtları korundu.`);
        }
      } else {
        toast(r.reason ?? 'Çalışan silinemedi.', 'info');
      }
      await load();
    } catch (err) {
      showError(err);
    }
  };

  const columns: Column<Employee>[] = [
    { key: 'no', header: 'Çalışan No', width: '100px', sortValue: (r) => r.employeeNo, render: (r) => <span className="font-mono text-slate-600">{r.employeeNo}</span> },
    {
      key: 'name', header: 'Ad soyad', title: true, sortValue: (r) => r.fullName, render: (r) => <span className="font-medium">{r.fullName}</span>,
      edit: { type: 'text', value: (r) => r.fullName, save: (r, v) => patch(r, { fullName: String(v) }) },
    },
    {
      key: 'position', header: 'Görev', sortValue: (r) => r.position, render: (r) => r.position,
      edit: { type: 'text', value: (r) => r.position, save: (r, v) => patch(r, { position: String(v) }) },
    },
    {
      key: 'site', header: 'Şantiye', sortValue: (r) => r.siteName, render: (r) => r.siteName ?? <span className="text-slate-400">—</span>,
      edit: {
        type: 'select', value: (r) => String(r.siteId ?? 0),
        options: [{ value: '0', label: '— Şantiye yok —' }, ...sites.filter((s) => s.status === 'active').map((s) => ({ value: String(s.id), label: `${s.companyName} / ${s.name}` }))],
        save: (r, v) => patch(r, { siteId: Number(v) || null }),
      },
    },
    {
      key: 'salary', header: 'Aylık maaş', align: 'right', width: '140px', sortValue: (r) => r.monthlySalaryKurus, render: (r) => money(r.monthlySalaryKurus),
      edit: { type: 'money', value: (r) => r.monthlySalaryKurus, save: (r, v) => patch(r, { monthlySalaryKurus: Number(v) }) },
    },
    {
      key: 'rate', header: 'Saatlik mesai ücreti', align: 'right', width: '150px', sortValue: (r) => r.overtimeRateKurus, render: (r) => money(r.overtimeRateKurus),
      edit: { type: 'money', value: (r) => r.overtimeRateKurus, save: (r, v) => patch(r, { overtimeRateKurus: Number(v) }) },
    },
    {
      key: 'start', header: 'İşe başlama', width: '120px', sortValue: (r) => r.startDate, render: (r) => formatDate(r.startDate) || <span className="text-slate-400">—</span>,
      edit: { type: 'date', value: (r) => r.startDate ?? '', save: (r, v) => patch(r, { startDate: String(v) || null }) },
    },
    {
      key: 'status', header: 'Durum', width: '100px', sortValue: (r) => r.status, render: (r) => <StatusBadge status={r.status} />,
      edit: {
        type: 'select', value: (r) => r.status,
        options: [{ value: 'active', label: 'Aktif' }, { value: 'left', label: 'Ayrıldı' }],
        save: async (r, v) => {
          await api.employeeSetStatus({ id: r.id, status: v as 'active' | 'left' });
          toast('Durum güncellendi.');
          await load();
        },
      },
    },
    {
      key: 'actions', header: 'İşlemler', width: '210px',
      render: (r) => (
        <div className="flex gap-1">
          <button className="btn-link" onClick={() => setDetailId(r.id)}><Eye size={14} /> Detay</button>
          <button className="btn-link" onClick={() => setEditing(r)}><Pencil size={14} /> Düzenle</button>
          <button className="btn-link-danger" onClick={() => void remove(r)}><Trash2 size={14} /> Sil</button>
        </div>
      ),
    },
  ];

  const counts = { all: rows.length, active: rows.filter((r) => r.status === 'active').length, left: rows.filter((r) => r.status === 'left').length };

  return (
    <div>
      <PageHeader
        title="Çalışanlar"
        description="Hücreye tıklayarak doğrudan düzenleyebilirsiniz. Sütun başlığına tıklayarak sıralayabilirsiniz."
        actions={<button className="btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> Yeni çalışan</button>}
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-72">
          <Search size={16} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className="input pl-8" placeholder="Ad, görev, T.C. veya numara ara…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Çalışan ara" />
        </div>
        <div className="flex overflow-hidden rounded border border-slate-300" role="group" aria-label="Durum filtresi">
          {([['active', 'Aktif'], ['left', 'Ayrılmış'], ['all', 'Tümü']] as [StatusFilter, string][]).map(([k, label]) => (
            <button key={k} onClick={() => setStatus(k)}
              className={`border-r border-slate-300 px-3 py-1.5 text-sm last:border-r-0 ${status === k ? 'bg-brand-600 text-white' : 'bg-surface hover:bg-slate-50'}`}>
              {label} ({counts[k]})
            </button>
          ))}
        </div>
        <ScopeSelect companies={companies} sites={sites} value={scope} onChange={setScope} />
      </div>
      <DataTable
        label="Çalışanlar"
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.id}
        onError={showError}
        defaultSort={{ key: 'name', dir: 'asc' }}
        emptyText={
          !loaded ? 'Yükleniyor…'
            : rows.length === 0 ? 'Henüz çalışan eklenmedi. “Yeni çalışan” düğmesiyle ilk çalışanı ekleyin.'
            : 'Aramanıza veya filtrenize uyan çalışan bulunamadı.'
        }
        footer={
          <tr>
            <td colSpan={4}>{filtered.length} çalışan</td>
            <td className="text-right tabular-nums">{money(filtered.reduce((s, r) => s + r.monthlySalaryKurus, 0))}</td>
            <td colSpan={4} className="font-normal text-slate-500">Toplam aylık maaş bilgisi (gider değildir)</td>
          </tr>
        }
      />
      {editing && <EmployeeForm employee={editing === 'new' ? undefined : editing} sites={sites} onClose={() => setEditing(null)} onSaved={() => { void load(); void reloadSites(); }} />}
      {detailId !== null && (
        <EmployeeDetailModal employeeId={detailId} employees={rows} onClose={() => setDetailId(null)} onChanged={load}
          onEdit={(e) => { setDetailId(null); setEditing(e); }} />
      )}
    </div>
  );
}

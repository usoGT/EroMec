import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, Eye, HardHat, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import type { Company, Employee, Site, Summary } from '../../shared/types';
import { formatDate, monthRange, todayIso } from '../../shared/dates';
import { formatMinutes } from '../../shared/overtime';
import { api } from '../lib/api';
import { useApp } from '../lib/context';
import { useSites } from '../lib/useSites';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import { SiteSelect } from '../components/SiteSelect';
import { CompanyForm, SiteForm } from './SiteForms';

export default function SitesPage() {
  const { toast, confirm, showError } = useApp();
  const { companies, sites, reload } = useSites();
  const [companyEdit, setCompanyEdit] = useState<Company | 'new' | null>(null);
  const [siteEdit, setSiteEdit] = useState<Site | 'new' | null>(null);
  const [detail, setDetail] = useState<Site | null>(null);

  const removeCompany = async (c: Company) => {
    if (!(await confirm({ title: 'Firmayı sil', message: <>“<b>{c.name}</b>” silinsin mi?</>, confirmText: 'Sil', danger: true }))) return;
    try {
      await api.companyDelete(c.id);
      toast('Firma silindi.');
      await reload();
    } catch (e) {
      showError(e);
    }
  };

  const removeSite = async (s: Site) => {
    if (!(await confirm({ title: 'Şantiyeyi sil', message: <>“<b>{s.name}</b>” silinsin mi? Bu şantiyedeki çalışanlar şantiyesiz kalır.</>, confirmText: 'Sil', danger: true }))) return;
    try {
      const r = await api.siteDelete(s.id);
      if (r.deleted) toast('Şantiye silindi.');
      else if (s.status === 'active' && (await confirm({ title: 'Şantiye silinemez', message: r.reason, confirmText: 'Tamamlandı olarak işaretle' }))) {
        await api.siteSave({ id: s.id, input: { ...s, status: 'completed' } });
        toast(`${s.name} “Tamamlandı” olarak işaretlendi.`);
      } else if (s.status !== 'active') toast(r.reason ?? 'Şantiye silinemedi.', 'info');
      await reload();
    } catch (e) {
      showError(e);
    }
  };

  return (
    <div>
      <PageHeader
        title="Firmalar ve Şantiyeler"
        description="Ana firmanızı ve çalıştığınız diğer firmaları, onlara bağlı şantiyeleri buradan yönetin."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setCompanyEdit('new')}><Building2 size={16} /> Yeni firma</button>
            <button className="btn-primary" onClick={() => setSiteEdit('new')}><HardHat size={16} /> Yeni şantiye</button>
          </>
        }
      />
      <h2 className="mb-2 font-semibold">Şantiyeler</h2>
      <DataTable
        label="Şantiyeler"
        rows={sites}
        rowKey={(r) => r.id}
        onError={showError}
        emptyText="Henüz şantiye yok. “Yeni şantiye” ile ekleyin."
        columns={[
          { key: 'company', header: 'Firma', sortValue: (r) => r.companyName, render: (r) => r.companyName },
          { key: 'name', header: 'Şantiye', title: true, sortValue: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'address', header: 'Adres', render: (r) => r.address },
          { key: 'start', header: 'Başlangıç', width: '110px', sortValue: (r) => r.startDate, render: (r) => formatDate(r.startDate) },
          { key: 'emp', header: 'Aktif çalışan', width: '110px', align: 'right', sortValue: (r) => r.employeeCount, render: (r) => r.employeeCount },
          {
            key: 'status', header: 'Durum', width: '120px', sortValue: (r) => r.status,
            render: (r) => <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${r.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'}`}>{r.status === 'active' ? 'Devam ediyor' : 'Tamamlandı'}</span>,
          },
          {
            key: 'actions', header: 'İşlemler', width: '220px',
            render: (r) => (
              <div className="flex gap-1">
                <button className="btn-link" onClick={() => setDetail(r)}><Eye size={14} /> Detay</button>
                <button className="btn-link" onClick={() => setSiteEdit(r)}><Pencil size={14} /> Düzenle</button>
                <button className="btn-link-danger" onClick={() => void removeSite(r)}><Trash2 size={14} /> Sil</button>
              </div>
            ),
          },
        ]}
      />
      <h2 className="mb-2 mt-6 font-semibold">Firmalar</h2>
      <DataTable
        label="Firmalar"
        rows={companies}
        rowKey={(r) => r.id}
        emptyText="Henüz firma yok."
        columns={[
          { key: 'name', header: 'Firma adı', sortValue: (r) => r.name, render: (r) => <span className="font-medium">{r.name}</span> },
          { key: 'tax', header: 'Vergi dairesi / no', render: (r) => [r.taxOffice, r.taxNo].filter(Boolean).join(' / ') },
          { key: 'phone', header: 'Telefon', render: (r) => r.phone },
          { key: 'sites', header: 'Şantiye sayısı', width: '120px', align: 'right', sortValue: (r) => r.siteCount, render: (r) => r.siteCount },
          {
            key: 'actions', header: 'İşlemler', width: '150px',
            render: (r) => (
              <div className="flex gap-1">
                <button className="btn-link" onClick={() => setCompanyEdit(r)}><Pencil size={14} /> Düzenle</button>
                <button className="btn-link-danger" onClick={() => void removeCompany(r)}><Trash2 size={14} /> Sil</button>
              </div>
            ),
          },
        ]}
      />
      {companyEdit && <CompanyForm company={companyEdit === 'new' ? undefined : companyEdit} onClose={() => setCompanyEdit(null)} onSaved={reload} />}
      {siteEdit && <SiteForm site={siteEdit === 'new' ? undefined : siteEdit} companies={companies} onClose={() => setSiteEdit(null)} onSaved={reload} />}
      {detail && <SiteDetailModal site={detail} sites={sites} onClose={() => setDetail(null)} onChanged={reload} />}
    </div>
  );
}

function SiteDetailModal({ site, sites, onClose, onChanged }: { site: Site; sites: Site[]; onClose: () => void; onChanged: () => void }) {
  const { money, toast, showError } = useApp();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [month, setMonth] = useState<Summary | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const m = monthRange(todayIso());
      const [emps, sum] = await Promise.all([api.employeesList(), api.summary({ ...m, siteId: site.id })]);
      setEmployees(emps);
      setMonth(sum);
    } catch (e) {
      showError(e);
    }
  }, [site.id, showError]);
  useEffect(() => {
    void load();
  }, [load]);

  const here = employees.filter((e) => e.siteId === site.id && e.status === 'active');

  const moveOut = async (e: Employee, target: number | null) => {
    try {
      await api.employeesAssignSite({ employeeIds: [e.id], siteId: target });
      toast(`${e.fullName} ${target ? 'taşındı' : 'şantiyeden çıkarıldı'}.`);
      await load();
      onChanged();
    } catch (err) {
      showError(err);
    }
  };

  return (
    <>
      <Modal title={`Şantiye — ${site.name}`} onClose={onClose} width="w-[820px]"
        footer={<><button className="btn-secondary" onClick={() => setAssignOpen(true)}><UserPlus size={15} /> Çalışan ata</button><button className="btn-primary" onClick={onClose}>Kapat</button></>}>
        <div className="mb-3 text-sm text-slate-600">{site.companyName}{site.address ? ` · ${site.address}` : ''}{site.startDate ? ` · Başlangıç: ${formatDate(site.startDate)}` : ''}</div>
        {month && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
            <div className="card px-3 py-2"><div className="text-slate-500">Bu ay mesai</div><div className="font-semibold">{formatMinutes(month.overtimeMinutes)} · {money(month.overtimeKurus)}</div></div>
            <div className="card px-3 py-2"><div className="text-slate-500">Bu ay maaş</div><div className="font-semibold">{money(month.salaryKurus)}</div></div>
            <div className="card px-3 py-2"><div className="text-slate-500">Bu ay diğer gider</div><div className="font-semibold">{money(month.otherKurus)}</div></div>
            <div className="card px-3 py-2"><div className="text-slate-500">Bu ay toplam</div><div className="font-semibold">{money(month.totalKurus)}</div></div>
          </div>
        )}
        <h3 className="mb-1 font-semibold">Bu şantiyedeki çalışanlar ({here.length})</h3>
        {here.length === 0 ? (
          <p className="text-sm text-slate-500">Bu şantiyede aktif çalışan yok. “Çalışan ata” ile ekleyebilirsiniz.</p>
        ) : (
          <table className="grid-table" aria-label="Şantiye çalışanları">
            <thead><tr><th>Ad soyad</th><th>Görev</th><th className="text-right">Saatlik mesai ücreti</th><th>Başka şantiyeye taşı</th></tr></thead>
            <tbody>
              {here.map((e) => (
                <tr key={e.id}>
                  <td className="font-medium">{e.fullName}</td>
                  <td>{e.position}</td>
                  <td className="text-right tabular-nums">{money(e.overtimeRateKurus)}</td>
                  <td className="!p-0.5"><SiteSelect sites={sites} value={site.id} onChange={(v) => void moveOut(e, v)} className="w-full rounded border border-slate-300 bg-surface px-1.5 py-0.5 text-sm" emptyLabel="— Şantiyeden çıkar —" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
      {assignOpen && <AssignEmployeesModal site={site} employees={employees} onClose={() => setAssignOpen(false)} onDone={() => { void load(); onChanged(); }} />}
    </>
  );
}

/** Birden çok çalışanı tek seferde şantiyeye atama. */
function AssignEmployeesModal({ site, employees, onClose, onDone }: { site: Site; employees: Employee[]; onClose: () => void; onDone: () => void }) {
  const { toast, showError } = useApp();
  const candidates = useMemo(() => employees.filter((e) => e.status === 'active' && e.siteId !== site.id), [employees, site.id]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const save = async () => {
    try {
      const n = await api.employeesAssignSite({ employeeIds: [...selected], siteId: site.id });
      toast(`${n} çalışan ${site.name} şantiyesine atandı.`);
      onDone();
      onClose();
    } catch (e) {
      showError(e);
    }
  };
  return (
    <Modal title={`${site.name} — çalışan ata`} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Vazgeç</button><button className="btn-primary" disabled={selected.size === 0} onClick={() => void save()}><Plus size={15} /> {selected.size} çalışanı ata</button></>}>
      {candidates.length === 0 ? <p className="text-sm text-slate-500">Atanabilecek başka aktif çalışan yok.</p> : (
        <>
          <label className="mb-2 flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={selected.size === candidates.length} onChange={(e) => setSelected(new Set(e.target.checked ? candidates.map((c) => c.id) : []))} />
            Hepsini seç
          </label>
          <div className="max-h-80 overflow-y-auto rounded border border-slate-200">
            {candidates.map((e) => (
              <label key={e.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-1.5 text-sm last:border-b-0 hover:bg-brand-50">
                <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)} />
                <span className="font-medium">{e.fullName}</span>
                <span className="text-slate-500">{e.position}</span>
                <span className="ml-auto text-xs text-slate-500">{e.siteName ? `Şu an: ${e.siteName}` : 'Şantiyesiz'}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

// Takvimde bir güne tıklayınca açılan pencere: günlük raporlar, mesailer, giderler.
import { useCallback, useEffect, useState } from 'react';
import { Clock, FileText, Pencil, Plus, Receipt, Trash2, Users } from 'lucide-react';
import type { Category, DailyReport, DayDetail, Employee, Site } from '../../shared/types';
import { formatDate, parseIsoDate } from '../../shared/dates';
import { formatMinutes } from '../../shared/overtime';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/context';
import { scopeToFilter } from '../lib/useSites';
import Modal from '../components/Modal';
import { Field, FormError } from '../components/Fields';
import { SiteSelect } from '../components/SiteSelect';
import OvertimeForm from './OvertimeForm';
import BulkOvertimeForm from './BulkOvertimeForm';
import ExpenseForm from './ExpenseForm';

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export default function DayDetailModal({ date, scope, employees, sites, onClose, onChanged }: {
  date: string; scope: string; employees: Employee[]; sites: Site[]; onClose: () => void; onChanged: () => void;
}) {
  const { money, toast, confirm, showError } = useApp();
  const [d, setD] = useState<DayDetail | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [open, setOpen] = useState<'overtime' | 'bulk' | 'expense' | null>(null);
  const [reportEdit, setReportEdit] = useState<DailyReport | 'new' | null>(null);
  const filter = scopeToFilter(scope);

  const load = useCallback(async () => {
    try {
      const [detail, cats] = await Promise.all([api.dayDetail({ date, ...scopeToFilter(scope) }), api.categoriesList()]);
      setD(detail);
      setCategories(cats);
    } catch (e) {
      showError(e);
    }
  }, [date, scope, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = () => {
    void load();
    onChanged();
  };

  const removeReport = async (r: DailyReport) => {
    if (!(await confirm({ title: 'Raporu sil', message: `${formatDate(r.date)} tarihli ${r.siteName ?? 'genel'} raporu silinsin mi?`, confirmText: 'Sil', danger: true }))) return;
    try {
      await api.dailyReportDelete(r.id);
      toast('Rapor silindi.');
      changed();
    } catch (e) {
      showError(e);
    }
  };

  const title = `${formatDate(date)} ${DAY_NAMES[parseIsoDate(date).getDay()]}`;

  return (
    <>
      <Modal title={title} onClose={onClose} width="w-[900px]" footer={<button className="btn-primary" onClick={onClose}>Kapat</button>}>
        {!d ? <div className="text-slate-500">Yükleniyor…</div> : (
          <div data-testid="day-detail">
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <div className="card px-3 py-2"><div className="text-slate-500">Mesai</div><div className="font-semibold">{formatMinutes(d.summary.overtimeMinutes)} · {money(d.summary.overtimeKurus)}</div></div>
              <div className="card px-3 py-2"><div className="text-slate-500">Maaş ödemeleri</div><div className="font-semibold">{money(d.summary.salaryKurus)}</div></div>
              <div className="card px-3 py-2"><div className="text-slate-500">Diğer giderler</div><div className="font-semibold">{money(d.summary.otherKurus)}</div></div>
              <div className="card px-3 py-2"><div className="text-slate-500">Günün toplam gideri</div><div className="font-semibold">{money(d.summary.totalKurus)}</div></div>
            </div>
            <div className="mb-4 flex flex-wrap gap-2">
              <button className="btn-primary" onClick={() => setReportEdit('new')}><FileText size={15} /> Günlük rapor yaz</button>
              <button className="btn-secondary" onClick={() => setOpen('bulk')}><Users size={15} /> Toplu mesai</button>
              <button className="btn-secondary" onClick={() => setOpen('overtime')}><Clock size={15} /> Mesai ekle</button>
              <button className="btn-secondary" onClick={() => setOpen('expense')}><Receipt size={15} /> Gider ekle</button>
            </div>

            <h3 className="mb-1 font-semibold">Günlük raporlar</h3>
            {reportEdit && (
              <ReportForm date={date} report={reportEdit === 'new' ? undefined : reportEdit} sites={sites}
                initialSiteId={filter.siteId ?? null} onCancel={() => setReportEdit(null)} onSaved={() => { setReportEdit(null); changed(); }} />
            )}
            {d.reports.length === 0 && !reportEdit ? (
              <p className="mb-3 text-sm text-slate-500">Bu gün için yazılmış rapor yok.</p>
            ) : (
              <div className="mb-3 space-y-2">
                {d.reports.map((r) => (
                  <div key={r.id} className="card px-3 py-2 text-sm" data-testid="daily-report">
                    <div className="mb-1 flex items-center gap-2">
                      <b>{r.siteName ?? 'Genel'}</b>
                      {r.weather && <span className="text-slate-500">· Hava: {r.weather}</span>}
                      <span className="ml-auto flex gap-1">
                        <button className="btn-link" onClick={() => setReportEdit(r)}><Pencil size={13} /> Düzenle</button>
                        <button className="btn-link-danger" onClick={() => void removeReport(r)}><Trash2 size={13} /> Sil</button>
                      </span>
                    </div>
                    {r.workDone && <div className="whitespace-pre-wrap"><span className="text-slate-500">Yapılan işler: </span>{r.workDone}</div>}
                    {r.notes && <div className="mt-1 whitespace-pre-wrap"><span className="text-slate-500">Notlar: </span>{r.notes}</div>}
                  </div>
                ))}
              </div>
            )}

            <h3 className="mb-1 font-semibold">Mesailer ({d.overtime.length})</h3>
            {d.overtime.length === 0 ? <p className="mb-3 text-sm text-slate-500">Bu gün mesai kaydı yok.</p> : (
              <table className="grid-table mb-3" aria-label="Günün mesaileri">
                <thead><tr><th>Çalışan</th><th>Şantiye</th><th>Saat</th><th className="text-right">Süre</th><th className="text-right">Tutar</th><th>Açıklama</th></tr></thead>
                <tbody>
                  {d.overtime.map((o) => (
                    <tr key={o.id}>
                      <td className="font-medium">{o.employeeName}</td><td>{o.siteName ?? '—'}</td>
                      <td>{o.startTime}–{o.endTime}</td><td className="text-right">{formatMinutes(o.workedMinutes)}</td>
                      <td className="text-right tabular-nums">{money(o.totalKurus)}</td><td>{o.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <h3 className="mb-1 font-semibold">Giderler ({d.expenses.length})</h3>
            {d.expenses.length === 0 ? <p className="text-sm text-slate-500">Bu gün gider kaydı yok.</p> : (
              <table className="grid-table" aria-label="Günün giderleri">
                <thead><tr><th>Gider</th><th>Kategori</th><th>Şantiye</th><th className="text-right">Tutar</th><th>Durum</th></tr></thead>
                <tbody>
                  {d.expenses.map((x) => (
                    <tr key={x.id}>
                      <td className="font-medium">{x.name}</td><td>{x.categoryName}</td><td>{x.siteName ?? 'Genel'}</td>
                      <td className="text-right tabular-nums">{money(x.amountKurus)}</td><td>{x.isPaid ? 'Ödendi' : 'Ödenmedi'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Modal>
      {open === 'overtime' && <OvertimeForm employees={employees} sites={sites} initialDate={date} onClose={() => setOpen(null)} onSaved={changed} />}
      {open === 'bulk' && <BulkOvertimeForm employees={employees} sites={sites} initialDate={date} initialSiteId={filter.siteId} onClose={() => setOpen(null)} onSaved={changed} />}
      {open === 'expense' && <ExpenseForm categories={categories} sites={sites} initialDate={date} initialSiteId={filter.siteId ?? null} onClose={() => setOpen(null)} onSaved={changed} />}
    </>
  );
}

function ReportForm({ date, report, sites, initialSiteId, onCancel, onSaved }: {
  date: string; report?: DailyReport; sites: Site[]; initialSiteId: number | null; onCancel: () => void; onSaved: () => void;
}) {
  const { toast } = useApp();
  const [siteId, setSiteId] = useState<number | null>(report ? report.siteId : initialSiteId);
  const [weather, setWeather] = useState(report?.weather ?? '');
  const [workDone, setWorkDone] = useState(report?.workDone ?? '');
  const [notes, setNotes] = useState(report?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.dailyReportSave({ date, siteId, weather, workDone, notes });
      toast('Günlük rapor kaydedildi.');
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card mb-3 border-brand-500 px-3 py-3" data-testid="report-form">
      <FormError message={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Şantiye" hint="Her şantiye için günde bir rapor tutulur; aynı şantiyeye tekrar yazarsanız rapor güncellenir.">
          <SiteSelect sites={sites} value={siteId} onChange={setSiteId} name="reportSite" emptyLabel="— Genel —" />
        </Field>
        <Field label="Hava durumu">
          <input name="weather" className="input" value={weather} onChange={(e) => setWeather(e.target.value)} maxLength={100} placeholder="ör. Güneşli, yağmurlu" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Yapılan işler"><textarea name="workDone" className="input" rows={3} value={workDone} onChange={(e) => setWorkDone(e.target.value)} maxLength={5000} autoFocus /></Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notlar / sorunlar / eksik malzeme"><textarea name="reportNotes" className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} /></Field>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onCancel}>Vazgeç</button>
        <button className="btn-primary" onClick={() => void save()} disabled={saving}><Plus size={15} /> Raporu kaydet</button>
      </div>
    </div>
  );
}

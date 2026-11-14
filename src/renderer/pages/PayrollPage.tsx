// Bordro: aylık maaş (normal + mesai), asgari (resmi) ve elden ödenecek tutarlar.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Lock, Undo2 } from 'lucide-react';
import type { PayrollMonth, PayrollRow } from '../../shared/types';
import { MONTH_NAMES, monthRange, todayIso } from '../../shared/dates';
import { formatDays } from '../../shared/attendance';
import { formatMinutes } from '../../shared/overtime';
import { api } from '../lib/api';
import { useApp } from '../lib/context';
import { scopeToFilter, useSites } from '../lib/useSites';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { Field } from '../components/Fields';
import { ScopeSelect } from '../components/SiteSelect';

/** Gösterilecek değerler: kaydedilmişse kilitli değerler, değilse puantajdan anlık hesap */
function values(r: PayrollRow) {
  const s = r.saved;
  return s
    ? { paidDays: s.paidHalfDays / 2, monthly: s.monthlySalaryKurus, normal: s.normalKurus, otMin: s.overtimeMinutes, ot: s.overtimeKurus, total: s.totalKurus, official: s.officialKurus, cash: s.cashKurus }
    : { paidDays: r.live.paidDays, monthly: r.live.monthlySalaryKurus, normal: r.live.normalKurus, otMin: r.live.overtimeMinutes, ot: r.live.overtimeKurus, total: r.live.totalKurus, official: r.live.officialKurus, cash: r.live.cashKurus };
}

export default function PayrollPage() {
  const { money, toast, confirm, showError } = useApp();
  const { companies, sites } = useSites();
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [scope, setScope] = useState('');
  const [data, setData] = useState<PayrollMonth | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saveOpen, setSaveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.payrollMonth({ month, ...scopeToFilter(scope) });
      setData(d);
      setSelected(new Set(d.rows.filter((r) => !r.saved && r.live.normalKurus > 0).map((r) => r.employeeId)));
    } catch (e) {
      showError(e);
    }
  }, [month, scope, showError]);
  useEffect(() => {
    void load();
  }, [load]);

  const shiftMonth = (delta: number) => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const sums = useMemo(() => (data?.rows ?? []).reduce((s, r) => {
    const v = values(r);
    return { normal: s.normal + v.normal, ot: s.ot + v.ot, total: s.total + v.total, official: s.official + v.official, cash: s.cash + v.cash };
  }, { normal: 0, ot: 0, total: 0, official: 0, cash: 0 }), [data]);

  const exportAs = async (format: 'xlsx' | 'pdf') => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.payrollExport({ month, format, ...scopeToFilter(scope) });
      if (r.saved) toast(`Bordro kaydedildi: ${r.path}`);
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const undo = async (r: PayrollRow) => {
    const ok = await confirm({
      title: 'Bordroyu geri al',
      message: <><b>{r.fullName}</b> için kaydedilen bordro ve bağlı maaş ödemesi gideri silinecek; tutarlar yeniden puantajdan hesaplanacak. Devam edilsin mi?</>,
      confirmText: 'Geri al', danger: true,
    });
    if (!ok) return;
    try {
      await api.payrollUndo({ employeeId: r.employeeId, month });
      toast('Bordro geri alındı.');
      await load();
    } catch (e) {
      showError(e);
    }
  };

  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Kaydedilmemiş ve normal maaşı hesaplanabilen (ücretli günü ve aylık maaşı olan) çalışanlar seçilebilir
  const canSelect = (r: PayrollRow) => !r.saved && r.live.normalKurus > 0;
  const selectable = data?.rows.filter(canSelect) ?? [];
  const [y, m] = month.split('-').map(Number);

  return (
    <div>
      <PageHeader
        title="Bordro"
        description="Puantaj ve mesailerden her çalışanın aylık maaşı: normal maaş + mesai parası = toplam; toplamın asgari (resmi) ve elden kısmı."
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
          <div className="min-w-36 border-x border-slate-300 bg-surface px-3 py-1.5 text-center font-semibold" data-testid="payroll-month">{MONTH_NAMES[m - 1]} {y}</div>
          <button className="bg-surface px-2 py-1.5 hover:bg-slate-50" onClick={() => shiftMonth(1)} aria-label="Sonraki ay"><ChevronRight size={18} /></button>
        </div>
        <ScopeSelect companies={companies} sites={sites} value={scope} onChange={setScope} />
        <button className="btn-primary" disabled={selected.size === 0} onClick={() => setSaveOpen(true)}><Lock size={16} /> Seçilenleri bordroya kaydet ({selected.size})</button>
        {data && <span className="ml-auto text-sm text-slate-600">Günlük asgari ücret: <b>{money(data.dailyMinWageKurus)}</b></span>}
      </div>
      {data && data.dailyMinWageKurus === 0 && (
        <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Günlük asgari ücret girilmemiş; asgari 0, toplamın tamamı elden görünür. <b>Ayarlar → Günlük asgari ücret</b> alanından girin.
        </p>
      )}

      <div className="card overflow-auto">
        <table className="grid-table" aria-label="Bordro">
          <thead>
            <tr>
              <th className="w-8 text-center">
                <input type="checkbox" aria-label="Hepsini seç" checked={selectable.length > 0 && selectable.every((r) => selected.has(r.employeeId))}
                  onChange={(e) => setSelected(new Set(e.target.checked ? selectable.map((r) => r.employeeId) : []))} />
              </th>
              <th>Çalışan</th>
              <th className="text-right">Aylık maaş</th>
              <th className="text-center">Ücretli gün</th>
              <th className="text-right">Normal maaş</th>
              <th className="text-right">Mesai</th>
              <th className="text-right">Mesai parası</th>
              <th className="!bg-red-700 text-right">TOPLAM</th>
              <th className="text-right">Asgari (resmi)</th>
              <th className="text-right">Elden</th>
              <th>Durum</th>
            </tr>
          </thead>
          <tbody>
            {!data ? null : data.rows.length === 0 ? (
              <tr><td colSpan={11} className="!py-10 text-center text-slate-500">Bu ay ve kapsamda çalışan yok.</td></tr>
            ) : data.rows.map((r) => {
              const v = values(r);
              return (
                <tr key={r.employeeId} data-employee={r.fullName}>
                  <td className="text-center">
                    {canSelect(r) && <input type="checkbox" aria-label={`${r.fullName} seç`} checked={selected.has(r.employeeId)} onChange={() => toggle(r.employeeId)} />}
                  </td>
                  <td>
                    <div className="font-medium">{r.fullName}{r.status === 'left' && <span className="text-slate-400"> (ayrıldı)</span>}</div>
                    <div className="text-xs text-slate-500">{r.position}{r.siteName ? ` · ${r.siteName}` : ''}{!r.hasAttendance && <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">puantaj yok</span>}</div>
                  </td>
                  <td className="text-right tabular-nums">{money(v.monthly)}</td>
                  <td className="text-center" data-testid="paid-days">{formatDays(v.paidDays)}</td>
                  <td className="text-right tabular-nums" data-testid="normal">{money(v.normal)}</td>
                  <td className="text-right">{v.otMin ? formatMinutes(v.otMin) : ''}</td>
                  <td className="text-right tabular-nums" data-testid="overtime">{money(v.ot)}</td>
                  <td className="bg-brand-50 text-right font-bold tabular-nums" data-testid="total">{money(v.total)}</td>
                  <td className="text-right tabular-nums" data-testid="official">{money(v.official)}</td>
                  <td className="text-right tabular-nums" data-testid="cash">{money(v.cash)}</td>
                  <td className="whitespace-nowrap">
                    {r.saved ? (
                      <span className="flex items-center gap-1">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${r.saved.isPaid ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>{r.saved.isPaid ? 'Ödendi' : 'Kaydedildi'}</span>
                        <button className="btn-link-danger" onClick={() => void undo(r)} title="Kaydı geri al"><Undo2 size={13} /> Geri al</button>
                      </span>
                    ) : <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600">Taslak</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {data && data.rows.length > 0 && (
            <tfoot>
              <tr>
                <td />
                <td>Toplam ({data.rows.length} çalışan)</td>
                <td /><td />
                <td className="text-right tabular-nums">{money(sums.normal)}</td>
                <td />
                <td className="text-right tabular-nums">{money(sums.ot)}</td>
                <td className="text-right tabular-nums" data-testid="sum-total">{money(sums.total)}</td>
                <td className="text-right tabular-nums" data-testid="sum-official">{money(sums.official)}</td>
                <td className="text-right tabular-nums" data-testid="sum-cash">{money(sums.cash)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className="mt-3 rounded border border-slate-200 bg-surface px-4 py-3 text-xs leading-relaxed text-slate-600">
        <b className="text-slate-800">Nasıl hesaplanır?</b>
        <ul className="mt-1 list-disc pl-4">
          <li><b>Ücretli gün</b> = puantajda işaretlenen günlerin toplamı; ay 30 da çekse 31 de çekse ay hesabı yapılmaz. Varsayılan: 8 (çalıştı), İ, T, H = 1 gün; 4 (yarım gün) = 0,5; Üİ, R, 0 (devamsız) ve boş günler sayılmaz. Değerler Puantaj → “Fırçaları düzenle”den değiştirilebilir.</li>
          <li><b>Normal maaş</b> = günlük ücret (aylık maaş ÷ 30) × ücretli gün. <b>Mesai parası</b> = o ayki mesai kayıtlarının toplamı. <b>TOPLAM</b> = normal maaş + mesai parası.</li>
          <li><b>Asgari (resmi)</b> = günlük asgari ücret × ücretli gün (toplamı geçemez). <b>Elden</b> = TOPLAM − asgari.</li>
          <li>Maaş, çalışanın o ay bütün şantiyelerdeki puantajından hesaplanır; şantiye seçimi yalnızca listeyi süzer.</li>
          <li><b>Bordroya kaydet</b> değerleri kilitler ve Giderler’e iki satır açar: “Personel maaşı” (normal maaş) ve “Ek mesai” (mesai parası). Raporlarda mesai, mesai kayıtlarından bir kez sayılır.</li>
        </ul>
      </div>

      {saveOpen && data && (
        <SaveModal month={month} rows={data.rows.filter((r) => selected.has(r.employeeId))} onClose={() => setSaveOpen(false)} onDone={() => void load()} />
      )}
    </div>
  );
}

function SaveModal({ month, rows, onClose, onDone }: { month: string; rows: PayrollRow[]; onClose: () => void; onDone: () => void }) {
  const { money, toast, showError } = useApp();
  const [date, setDate] = useState(() => {
    const end = monthRange(`${month}-01`).to;
    const t = todayIso();
    return t < end ? t : end;
  });
  const [isPaid, setIsPaid] = useState(true);
  const [busy, setBusy] = useState(false);
  const total = rows.reduce((s, r) => s + r.live.totalKurus, 0);
  const save = async () => {
    setBusy(true);
    try {
      const res = await api.payrollSave({ month, employeeIds: rows.map((r) => r.employeeId), date, isPaid });
      toast(`${res.saved} çalışanın bordrosu kaydedildi (toplam ${money(res.totalKurus)}).`);
      if (res.skipped.length) toast(`Atlananlar: ${res.skipped.map((s) => `${s.employeeName} (${s.reason})`).join(', ')}`, 'info');
      onDone();
      onClose();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Bordroya kaydet" onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Vazgeç</button><button className="btn-primary" onClick={() => void save()} disabled={busy}>Kaydet</button></>}>
      <p className="mb-3 text-sm text-slate-700">
        <b>{rows.length} çalışanın</b> bordrosu kaydedilecek (toplam <b>{money(total)}</b>). Değerler kilitlenir; sonradan maaş veya puantaj değişirse kayıtlı bordro değişmez (gerekirse “Geri al” ile yeniden hesaplayabilirsiniz).
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Ödeme tarihi"><input type="date" name="payDate" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Ödeme durumu">
          <select name="payPaid" className="input" value={isPaid ? '1' : '0'} onChange={(e) => setIsPaid(e.target.value === '1')}>
            <option value="1">Ödendi</option>
            <option value="0">Ödenmedi</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

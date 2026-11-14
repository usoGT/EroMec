// Toplu mesai: bir şantiyedeki bütün çalışanlara aynı saatlerde tek tıkla mesai yazma.
import { useEffect, useMemo, useState } from 'react';
import type { Employee, Site } from '../../shared/types';
import { todayIso } from '../../shared/dates';
import { moneyToInput, parseMoney } from '../../shared/money';
import { calculateOvertime, formatMinutes } from '../../shared/overtime';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/context';
import Modal from '../components/Modal';
import { Field, FormError } from '../components/Fields';
import { SiteSelect } from '../components/SiteSelect';

interface Row { employee: Employee; checked: boolean; rateText: string }

export default function BulkOvertimeForm({ employees, sites, initialSiteId, initialDate, preselectIds, onClose, onSaved }: {
  employees: Employee[]; sites: Site[]; initialSiteId?: number | null; initialDate?: string;
  /** Verilirse yalnızca bu çalışanlar işaretli gelir (ör. puantajdaki liste) */
  preselectIds?: number[];
  onClose: () => void; onSaved: () => void;
}) {
  const { money, toast, confirm } = useApp();
  // null: bilinçli olarak "bütün çalışanlar"; undefined: ilk aktif şantiye önerilir
  const firstSite = initialSiteId !== undefined ? initialSiteId : sites.find((s) => s.status === 'active')?.id ?? null;
  const [siteId, setSiteId] = useState<number | null>(firstSite);
  const [date, setDate] = useState(initialDate ?? todayIso());
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('20:00');
  const [breakMinutes, setBreakMinutes] = useState('0');
  const [description, setDescription] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Şantiye değişince o şantiyenin aktif çalışanları listelenir ve hepsi seçili gelir.
  useEffect(() => {
    const list = employees.filter((e) => e.status === 'active' && (siteId ? e.siteId === siteId : true));
    setRows(list.map((e) => ({
      employee: e,
      checked: preselectIds ? preselectIds.includes(e.id) : siteId !== null,
      rateText: moneyToInput(e.overtimeRateKurus),
    })));
  }, [siteId, employees, preselectIds]);

  const calc = useMemo(() => {
    if (!/^\d+$/.test(breakMinutes.trim())) return { error: 'Mola süresi dakika olarak tam sayı olmalıdır.' };
    try {
      return calculateOvertime({ startTime, endTime, breakMinutes: Number(breakMinutes), hourlyRateKurus: 0 });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [startTime, endTime, breakMinutes]);

  const selected = rows.filter((r) => r.checked);
  const worked = 'error' in calc ? 0 : calc.workedMinutes;
  const amountOf = (r: Row) => Math.round((worked * (parseMoney(r.rateText) ?? 0)) / 60);
  const total = selected.reduce((s, r) => s + amountOf(r), 0);
  const setRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (saving) return;
    if ('error' in calc) return setError(calc.error ?? null);
    if (selected.length === 0) return setError('En az bir çalışan seçin.');
    const bad = selected.find((r) => parseMoney(r.rateText) === null || parseMoney(r.rateText)! < 0);
    if (bad) return setError(`${bad.employee.fullName} için saatlik ücret geçersiz.`);
    const siteName = sites.find((s) => s.id === siteId)?.name ?? 'şantiyesiz';
    const ok = await confirm({
      title: 'Toplu mesai',
      message: <><b>{selected.length} çalışana</b> {siteName} için {startTime}–{endTime} mesai yazılacak. Toplam: <b>{money(total)}</b>. Onaylıyor musunuz?</>,
      confirmText: 'Evet, ekle',
    });
    if (!ok) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.overtimeBulkCreate({
        siteId, date, startTime, endTime, breakMinutes: Number(breakMinutes), description,
        entries: selected.map((r) => ({ employeeId: r.employee.id, hourlyRateKurus: parseMoney(r.rateText)! })),
      });
      toast(`${res.created} çalışana mesai eklendi (${money(res.totalKurus)}).`);
      if (res.skipped.length) {
        toast(`Atlananlar: ${res.skipped.map((s) => `${s.employeeName} (${s.reason})`).join(', ')}`, 'info');
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Toplu mesai ekle" onClose={onClose} width="w-[820px]"
      footer={<><button className="btn-secondary" onClick={onClose}>Vazgeç</button><button className="btn-primary" onClick={() => void submit()} disabled={saving}>{selected.length} çalışana mesai ekle</button></>}>
      <FormError message={error} />
      <div className="grid grid-cols-2 gap-x-3 sm:grid-cols-6 gap-y-3">
        <div className="col-span-2 sm:col-span-3"><Field label="Şantiye" required><SiteSelect sites={sites} value={siteId} onChange={setSiteId} name="bulkSite" emptyLabel="— Bütün aktif çalışanlar —" /></Field></div>
        <div className="col-span-2 sm:col-span-3"><Field label="Tarih" required><input name="bulkDate" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field></div>
        <div className="col-span-1 sm:col-span-2"><Field label="Başlangıç" required><input name="bulkStart" type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field></div>
        <div className="col-span-1 sm:col-span-2"><Field label="Bitiş" required><input name="bulkEnd" type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field></div>
        <div className="col-span-1 sm:col-span-2"><Field label="Mola (dakika)"><input name="bulkBreak" className="input" inputMode="numeric" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} /></Field></div>
        <div className="col-span-2 sm:col-span-6"><Field label="Açıklama"><input name="bulkDesc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="ör. Teslim öncesi gece çalışması" /></Field></div>
      </div>
      <div className="mb-1 mt-4 flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 font-medium">
          <input type="checkbox" checked={rows.length > 0 && selected.length === rows.length} onChange={(e) => setRows((rs) => rs.map((r) => ({ ...r, checked: e.target.checked })))} />
          Hepsini seç ({selected.length}/{rows.length})
        </label>
        <span data-testid="bulk-preview" className={'error' in calc ? 'text-red-700' : 'text-slate-700'}>
          {'error' in calc ? calc.error : <>Kişi başı <b>{formatMinutes(worked)}</b>{calc.crossesMidnight ? ' (gece yarısını aşıyor)' : ''} · Toplam: <b>{money(total)}</b></>}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded border border-slate-200 px-3 py-6 text-center text-sm text-slate-500">Bu şantiyede aktif çalışan yok. Çalışanları Şantiyeler veya Çalışanlar bölümünden bu şantiyeye atayın.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <table className="grid-table" aria-label="Toplu mesai çalışanları">
            <thead><tr><th className="w-8" /><th>Çalışan</th><th>Görev</th><th className="w-36 text-right">Saatlik ücret</th><th className="w-32 text-right">Tutar</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.employee.id} className={r.checked ? '' : 'opacity-60'}>
                  <td className="text-center"><input type="checkbox" aria-label={`${r.employee.fullName} seç`} checked={r.checked} onChange={(e) => setRow(i, { checked: e.target.checked })} /></td>
                  <td className="font-medium">{r.employee.fullName}</td>
                  <td>{r.employee.position}</td>
                  <td className="!p-0.5"><input aria-label={`${r.employee.fullName} saatlik ücret`} className={`w-full rounded border px-1.5 py-0.5 text-right text-sm ${parseMoney(r.rateText) === null ? 'border-red-500' : 'border-slate-300'} bg-surface`} value={r.rateText} onChange={(e) => setRow(i, { rateText: e.target.value })} inputMode="decimal" /></td>
                  <td className="text-right tabular-nums">{r.checked ? money(amountOf(r)) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-xs text-slate-500">Saatlik ücretler çalışan kartından gelir; bu mesai için satırda değiştirebilirsiniz. Aynı tarih ve başlangıç saatinde zaten mesaisi olan çalışanlar atlanır.</p>
    </Modal>
  );
}

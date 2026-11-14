// Puantaj hücresinden mesai: bir çalışanın o günkü mesaileri listelenir, yenisi eklenir veya silinir.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { AttendanceRow, OvertimeRecord } from '../../shared/types';
import { formatDate } from '../../shared/dates';
import { calculateOvertime, formatMinutes } from '../../shared/overtime';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/context';
import Modal from '../components/Modal';
import { Field, FormError, MoneyInput } from '../components/Fields';

export default function CellOvertimeModal({ row, date, defaultRateKurus, siteId, onClose, onChanged }: {
  row: AttendanceRow; date: string; defaultRateKurus: number;
  /** Tek şantiye seçiliyse mesai o şantiyeye yazılır; yoksa çalışanın şantiyesine */
  siteId?: number;
  onClose: () => void; onChanged: () => void;
}) {
  const { money, toast, confirm, showError } = useApp();
  const [records, setRecords] = useState<OvertimeRecord[]>([]);
  const [startTime, setStartTime] = useState('17:00');
  const [endTime, setEndTime] = useState('20:00');
  const [breakMinutes, setBreakMinutes] = useState('0');
  const [rate, setRate] = useState<number | null>(defaultRateKurus);
  const [description, setDescription] = useState('');
  const [markWorked, setMarkWorked] = useState(!row.cells[date]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setRecords(await api.overtimeList({ employeeId: row.employeeId, from: date, to: date, siteId }));
    } catch (e) {
      showError(e);
    }
  }, [row.employeeId, date, siteId, showError]);
  useEffect(() => {
    void load();
  }, [load]);

  const preview = useMemo(() => {
    if (!/^\d+$/.test(breakMinutes.trim())) return { error: 'Mola süresi dakika olarak tam sayı olmalıdır.' };
    try {
      return calculateOvertime({ startTime, endTime, breakMinutes: Number(breakMinutes), hourlyRateKurus: rate ?? 0 });
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [startTime, endTime, breakMinutes, rate]);

  const add = async () => {
    if (saving) return;
    if ('error' in preview) return setError(preview.error ?? null);
    if (rate === null) return setError('Geçerli bir saatlik ücret girin.');
    setSaving(true);
    setError(null);
    try {
      const input = { employeeId: row.employeeId, date, startTime, endTime, breakMinutes: Number(breakMinutes), hourlyRateKurus: rate, description, ...(siteId ? { siteId } : {}) };
      let res = await api.overtimeCreate({ input });
      if (res.duplicate) {
        if (!(await confirm({ title: 'Aynı gün başka mesai var', message: res.duplicate, confirmText: 'Yine de ekle' }))) return;
        res = await api.overtimeCreate({ input, force: true });
      }
      // Mesai yapılan gün puantajda boşsa "Çalıştı" olarak işaretlenir (isteğe bağlı)
      if (markWorked && !row.cells[date]) await api.attendanceSet({ entries: [{ employeeId: row.employeeId, date, status: 'X' }], siteId });
      toast(`Mesai eklendi: ${row.fullName}, ${formatMinutes(res.item!.workedMinutes)}, ${money(res.item!.totalKurus)}`);
      await load();
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (o: OvertimeRecord) => {
    if (!(await confirm({ title: 'Mesaiyi sil', message: `${o.startTime}–${o.endTime} (${money(o.totalKurus)}) mesaisi silinsin mi?`, confirmText: 'Sil', danger: true }))) return;
    try {
      await api.overtimeDelete(o.id);
      toast('Mesai silindi.');
      await load();
      onChanged();
    } catch (e) {
      showError(e);
    }
  };

  return (
    <Modal title={`Mesai — ${row.fullName} · ${formatDate(date)}`} onClose={onClose}
      footer={<button className="btn-secondary" onClick={onClose}>Kapat</button>}>
      <h3 className="mb-1 text-sm font-semibold">Bu günkü mesailer</h3>
      {records.length === 0 ? <p className="mb-3 text-sm text-slate-500">Bu gün için mesai kaydı yok.</p> : (
        <table className="grid-table mb-3" aria-label="Hücre mesaileri">
          <thead><tr><th>Saat</th><th>Şantiye</th><th className="text-right">Süre</th><th className="text-right">Tutar</th><th /></tr></thead>
          <tbody>
            {records.map((o) => (
              <tr key={o.id}>
                <td>{o.startTime}–{o.endTime}{o.breakMinutes ? ` (mola ${o.breakMinutes} dk)` : ''}</td>
                <td>{o.siteName ?? '—'}</td>
                <td className="text-right">{formatMinutes(o.workedMinutes)}</td>
                <td className="text-right tabular-nums">{money(o.totalKurus)}</td>
                <td className="w-16"><button className="btn-link-danger" onClick={() => void remove(o)}><Trash2 size={13} /> Sil</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h3 className="mb-2 text-sm font-semibold">Mesai ekle</h3>
      <FormError message={error} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="Başlangıç"><input name="cellStart" type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></Field>
        <Field label="Bitiş"><input name="cellEnd" type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></Field>
        <Field label="Mola (dk)"><input name="cellBreak" className="input" inputMode="numeric" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} /></Field>
        <Field label="Saatlik ücret"><MoneyInput name="cellRate" value={rate} onChange={(k) => setRate(k)} /></Field>
        <div className="col-span-2 sm:col-span-4"><Field label="Açıklama"><input name="cellDesc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} /></Field></div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
        <span data-testid="cell-ot-preview" className={'error' in preview ? 'text-red-700' : ''}>
          {'error' in preview ? preview.error : <>Süre <b>{formatMinutes(preview.workedMinutes)}</b>{preview.crossesMidnight ? ' (gece yarısını aşıyor)' : ''} · Tutar <b>{money(preview.totalKurus)}</b></>}
        </span>
        <button className="btn-primary" onClick={() => void add()} disabled={saving}><Plus size={15} /> Mesaiyi ekle</button>
      </div>
      {!row.cells[date] && (
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" name="markWorked" checked={markWorked} onChange={(e) => setMarkWorked(e.target.checked)} />
          Puantajda bu günü “X — Çalıştı” olarak da işaretle
        </label>
      )}
    </Modal>
  );
}

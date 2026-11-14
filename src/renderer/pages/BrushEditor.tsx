// Puantaj fırçalarını düzenleme: hücre yazısı, ad, renk, ücretli gün ve çalışılan gün değeri; yeni fırça ekleme.
import { useState } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { DAY_VALUE_LABEL, textColorFor, type StatusDef } from '../../shared/attendance';
import type { StatusInput } from '../../shared/types';
import { api } from '../lib/api';
import { useApp } from '../lib/context';
import Modal from '../components/Modal';

type Row = StatusInput & { code?: string; isSystem?: boolean; dirty?: boolean };

export default function BrushEditor({ statuses, onClose, onChanged }: { statuses: StatusDef[]; onClose: () => void; onChanged: () => void }) {
  const { toast, confirm, showError } = useApp();
  const [rows, setRows] = useState<Row[]>(statuses.map((s) => ({ ...s })));
  const [busy, setBusy] = useState(false);
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch, dirty: true } : r)));

  const saveAll = async () => {
    setBusy(true);
    try {
      let n = 0;
      for (const r of rows) {
        if (!r.dirty) continue;
        const input = { short: r.short, label: r.label, color: r.color, paidHalf: r.paidHalf, workedHalf: r.workedHalf };
        await api.attendanceStatusSave({ code: r.code, input });
        n++;
      }
      toast(n ? `${n} fırça kaydedildi.` : 'Değişiklik yok.');
      onChanged();
      onClose();
    } catch (e) {
      showError(e);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (i: number) => {
    const r = rows[i];
    if (!r.code) return setRows((rs) => rs.filter((_, j) => j !== i));
    if (!(await confirm({ title: 'Fırçayı sil', message: `“${r.label}” fırçası silinsin mi?`, confirmText: 'Sil', danger: true }))) return;
    try {
      await api.attendanceStatusDelete(r.code);
      setRows((rs) => rs.filter((_, j) => j !== i));
      toast('Fırça silindi.');
      onChanged();
    } catch (e) {
      showError(e);
    }
  };

  const dayOptions = [2, 1, 0].map((v) => <option key={v} value={v}>{DAY_VALUE_LABEL[v]}</option>);

  return (
    <Modal title="Puantaj fırçaları" onClose={onClose} width="w-[900px]"
      footer={<><button className="btn-secondary" onClick={onClose}>Vazgeç</button><button className="btn-primary" onClick={() => void saveAll()} disabled={busy}><Save size={15} /> Kaydet</button></>}>
      <p className="mb-3 text-sm text-slate-600">
        <b>Hücre yazısı</b> puantajda görünen değerdir (ör. 8, 4, 0, İ). <b>Ücretli gün</b> maaş hesabında kaç gün sayılacağını,
        <b> çalışılan gün</b> “Gün” sütununda kaç gün sayılacağını belirler. Mevcut puantaj kayıtları korunur; değişiklik hemen tüm aylara yansır.
      </p>
      <table className="grid-table" aria-label="Fırçalar">
        <thead><tr><th className="w-16">Görünüm</th><th className="w-24">Hücre yazısı</th><th>Fırça adı</th><th className="w-20">Renk</th><th className="w-40">Ücretli gün</th><th className="w-40">Çalışılan gün</th><th className="w-14" /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.code ?? `new-${i}`} data-brush={r.label}>
              <td className="text-center"><span className="inline-flex h-7 min-w-9 items-center justify-center rounded px-1 font-bold" style={{ background: r.color, color: textColorFor(r.color) }}>{r.short}</span></td>
              <td className="!p-0.5"><input aria-label="Hücre yazısı" className="input text-center font-bold" maxLength={4} value={r.short} onChange={(e) => set(i, { short: e.target.value })} /></td>
              <td className="!p-0.5"><input aria-label="Fırça adı" className="input" maxLength={40} value={r.label} onChange={(e) => set(i, { label: e.target.value })} /></td>
              <td className="!p-0.5 text-center"><input aria-label="Renk" type="color" className="h-8 w-14 cursor-pointer rounded border border-slate-300" value={r.color} onChange={(e) => set(i, { color: e.target.value })} /></td>
              <td className="!p-0.5"><select aria-label="Ücretli gün" className="input" value={r.paidHalf} onChange={(e) => set(i, { paidHalf: Number(e.target.value) })}>{dayOptions}</select></td>
              <td className="!p-0.5"><select aria-label="Çalışılan gün" className="input" value={r.workedHalf} onChange={(e) => set(i, { workedHalf: Number(e.target.value) })}>{dayOptions}</select></td>
              <td className="text-center">{!r.isSystem && <button className="btn-link-danger" onClick={() => void remove(i)} title="Fırçayı sil"><Trash2 size={14} /></button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="btn-secondary mt-3" onClick={() => setRows((rs) => [...rs, { short: '', label: '', color: '#0f766e', paidHalf: 2, workedHalf: 2, dirty: true }])}>
        <Plus size={15} /> Yeni fırça ekle
      </button>
    </Modal>
  );
}

import { useMemo, useState } from 'react';
import { Eraser, Search } from 'lucide-react';
import type { AttendanceEntry, AttendanceRow } from '../../shared/types';
import { textColorFor, WEEKDAY_SHORT, type AttendanceStatus, type StatusDef } from '../../shared/attendance';
import { parseIsoDate } from '../../shared/dates';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/context';
import Modal from '../components/Modal';
import { FormError } from '../components/Fields';

interface Props {
  rows: AttendanceRow[];
  days: string[];
  statuses: StatusDef[];
  today: string;
  /** Tek şantiye seçiliyse kayıtlar o şantiyeye yazılır */
  siteId?: number;
  onClose: () => void;
  onDone: () => void;
}

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR');

/** Toplu puantaj: çalışanları ve günleri seç, tek tıkla hepsine aynı durumu işle. */
export default function BulkAttendanceForm({ rows, days, statuses, today, siteId, onClose, onDone }: Props) {
  const { toast } = useApp();
  const [status, setStatus] = useState<AttendanceStatus | 'erase'>(statuses[0]?.code ?? 'X');
  const [picked, setPicked] = useState<Set<number>>(() => new Set(rows.map((r) => r.employeeId)));
  const [dates, setDates] = useState<Set<string>>(() => new Set(days.includes(today) ? [today] : []));
  const [search, setSearch] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const shown = useMemo(() => {
    const q = trLower(search.trim());
    return q ? rows.filter((r) => trLower(`${r.fullName} ${r.position} ${r.siteName ?? ''}`).includes(q)) : rows;
  }, [rows, search]);
  const allShown = shown.length > 0 && shown.every((r) => picked.has(r.employeeId));

  const toggleEmp = (id: number) => setPicked((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleShown = (on: boolean) => setPicked((s) => {
    const n = new Set(s);
    for (const r of shown) if (on) n.add(r.employeeId); else n.delete(r.employeeId);
    return n;
  });
  const toggleDay = (d: string) => setDates((s) => {
    const n = new Set(s);
    if (n.has(d)) n.delete(d); else n.add(d);
    return n;
  });
  const isWeekend = (d: string) => [0, 6].includes(parseIsoDate(d).getDay());

  const entries = useMemo(() => {
    const out: AttendanceEntry[] = [];
    for (const r of rows) {
      if (!picked.has(r.employeeId)) continue;
      for (const d of days) {
        if (!dates.has(d)) continue;
        if (onlyEmpty && r.cells[d]) continue;
        out.push({ employeeId: r.employeeId, date: d, status: status === 'erase' ? null : status });
      }
    }
    return out;
  }, [rows, days, picked, dates, onlyEmpty, status]);

  const submit = async () => {
    if (picked.size === 0) return setError('En az bir çalışan seçin.');
    if (dates.size === 0) return setError('En az bir gün seçin.');
    if (entries.length === 0) return setError('Seçilen günlerde işlenecek boş hücre yok.');
    setSaving(true);
    setError(null);
    try {
      await api.attendanceSet({ entries, siteId });
      toast(`${picked.size} çalışan × ${dates.size} gün işlendi (${entries.length} hücre).`);
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const chip = 'rounded-full border px-3 py-1.5 text-xs font-medium';
  const idle = 'border-slate-300 bg-surface text-slate-700 hover:border-red-600';
  return (
    <Modal title="Toplu puantaj ekle" onClose={onClose} width="w-[820px]"
      footer={<><button className="btn-secondary" onClick={onClose}>Vazgeç</button><button className="btn-primary" data-testid="bulk-att-save" onClick={() => void submit()} disabled={saving}>{picked.size} çalışan × {dates.size} gün işle</button></>}>
      <FormError message={error} />

      <div className="mb-1 text-sm font-semibold">1. Durum</div>
      <div className="mb-4 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Durum">
        {statuses.map((s) => (
          <button key={s.code} type="button" role="radio" aria-checked={status === s.code} onClick={() => setStatus(s.code)}
            className={`flex items-center gap-1.5 rounded border px-2 py-1.5 text-xs ${status === s.code ? 'border-brand-600 ring-2 ring-brand-500' : 'border-slate-300'}`}>
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-bold" style={{ background: s.color, color: textColorFor(s.color) }}>{s.short}</span>
            <span className="text-slate-700">{s.label}</span>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={status === 'erase'} onClick={() => setStatus('erase')}
          className={`flex items-center gap-1 rounded border px-2 py-1.5 text-xs ${status === 'erase' ? 'border-brand-600 ring-2 ring-brand-500' : 'border-slate-300'}`}>
          <Eraser size={14} /> Sil
        </button>
      </div>

      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold">2. Günler <span className="font-normal text-slate-500">({dates.size} seçili)</span></span>
        <span className="flex flex-wrap gap-1.5">
          {days.includes(today) && <button type="button" className={`${chip} ${idle}`} onClick={() => setDates(new Set([today]))}>Bugün</button>}
          <button type="button" className={`${chip} ${idle}`} onClick={() => setDates(new Set(days.filter((d) => !isWeekend(d))))}>Hafta içi</button>
          <button type="button" className={`${chip} ${idle}`} onClick={() => setDates(new Set(days))}>Hepsi</button>
          <button type="button" className={`${chip} ${idle}`} onClick={() => setDates(new Set())}>Temizle</button>
        </span>
      </div>
      <div className="mb-2 grid grid-cols-7 gap-1 sm:grid-cols-[repeat(16,minmax(0,1fr))]" aria-label="Günler">
        {days.map((d) => {
          const on = dates.has(d);
          return (
            <button key={d} type="button" aria-pressed={on} data-day={d} onClick={() => toggleDay(d)}
              className={`rounded border py-1 text-center leading-tight ${on ? 'border-brand-600 bg-brand-600 text-white' : isWeekend(d) ? 'border-slate-300 bg-slate-100 text-slate-600' : 'border-slate-300 bg-surface'} ${d === today && !on ? 'ring-2 ring-brand-500' : ''}`}>
              <div className="text-sm font-bold">{Number(d.slice(8))}</div>
              <div className="text-[10px] opacity-80">{WEEKDAY_SHORT[parseIsoDate(d).getDay()]}</div>
            </button>
          );
        })}
      </div>
      <label className="mb-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} />
        Yalnızca boş hücreleri doldur (işaretli günlere dokunma)
      </label>

      <div className="mb-1 text-sm font-semibold">3. Çalışanlar <span className="font-normal text-slate-500">({picked.size}/{rows.length} seçili)</span></div>
      <div className="relative mb-2">
        <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="input !pl-8" placeholder="Çalışan ara (ad, görev, şantiye)…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Çalışan ara" />
      </div>
      <label className="mb-1 flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={allShown} onChange={(e) => toggleShown(e.target.checked)} />
        {search.trim() ? `Bulunanların hepsini seç (${shown.length})` : `Hepsini seç (${rows.length})`}
      </label>
      {shown.length === 0 ? (
        <p className="rounded border border-slate-200 px-3 py-6 text-center text-sm text-slate-500">Aramaya uyan çalışan yok.</p>
      ) : (
        <div className="max-h-72 overflow-y-auto rounded border border-slate-200 max-md:max-h-none">
          {shown.map((r) => (
            <label key={r.employeeId} className={`flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 ${picked.has(r.employeeId) ? 'bg-brand-50' : ''}`}>
              <input type="checkbox" checked={picked.has(r.employeeId)} onChange={() => toggleEmp(r.employeeId)} aria-label={`${r.fullName} seç`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.fullName}</span>
                <span className="block truncate text-xs text-slate-500">{r.position}{r.siteName ? ` · ${r.siteName}` : ''}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}

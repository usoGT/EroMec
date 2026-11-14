import { monthRange, todayIso, weekRange } from '../../shared/dates';

export interface Range { from: string; to: string }

/** Tarih aralığı filtresi ve hızlı seçim düğmeleri (Bugün / Bu hafta / Bu ay / Tümü). */
export default function DateRangeFilter({ value, onChange }: { value: Range; onChange: (r: Range) => void }) {
  const today = todayIso();
  const quick: [string, Range][] = [
    ['Bugün', { from: today, to: today }],
    ['Bu hafta', weekRange(today)],
    ['Bu ay', monthRange(today)],
    ['Tümü', { from: '', to: '' }],
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 max-md:w-full">
        <input type="date" aria-label="Başlangıç tarihi" className="input w-40 min-w-0 flex-1" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
        <span className="text-slate-500">–</span>
        <input type="date" aria-label="Bitiş tarihi" className="input w-40 min-w-0 flex-1" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </div>
      <div className="flex overflow-hidden rounded border border-slate-300 max-md:w-full max-md:[&>button]:flex-1">
        {quick.map(([label, r]) => {
          const active = r.from === value.from && r.to === value.to;
          return (
            <button key={label} type="button" onClick={() => onChange(r)}
              className={`border-r border-slate-300 px-2.5 py-1.5 text-sm last:border-r-0 ${active ? 'bg-brand-600 text-white' : 'bg-surface hover:bg-slate-50'}`}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

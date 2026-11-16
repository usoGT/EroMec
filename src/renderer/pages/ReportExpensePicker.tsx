// Rapor dışa aktarmadan önce: rapora hangi giderlerin gireceği seçilir (kategoriye göre gruplu, tek tek).
import { useEffect, useMemo, useState } from 'react';
import { FileDown, FileText } from 'lucide-react';
import type { Expense, SiteFilter } from '../../shared/types';
import { formatDate } from '../../shared/dates';
import { api } from '../lib/api';
import { useApp } from '../lib/context';
import Modal from '../components/Modal';

export default function ReportExpensePicker({ kind, range, filter, onClose, onConfirm }: {
  kind: 'csv' | 'pdf';
  range: { from: string; to: string };
  filter: SiteFilter;
  onClose: () => void;
  /** undefined = bütün giderler (seçim yapılmadı), dizi = yalnızca bunlar */
  onConfirm: (expenseIds: number[] | undefined) => void;
}) {
  const { money, showError } = useApp();
  const [list, setList] = useState<Expense[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    void api.expensesList({ ...range, ...filter })
      .then((xs) => {
        const sorted = [...xs].sort((a, b) => a.date.localeCompare(b.date));
        setList(sorted);
        setSelected(new Set(sorted.map((e) => e.id))); // varsayılan: hepsi seçili
      })
      .catch((e) => {
        showError(e);
        onClose();
      });
  }, [range, filter, showError, onClose]);

  const groups = useMemo(() => {
    const m = new Map<string, Expense[]>();
    for (const e of list ?? []) m.set(e.categoryName, [...(m.get(e.categoryName) ?? []), e]);
    return [...m.entries()];
  }, [list]);

  const toggle = (ids: number[], on: boolean) => setSelected((s) => {
    const n = new Set(s);
    for (const id of ids) {
      if (on) n.add(id);
      else n.delete(id);
    }
    return n;
  });

  const total = (list ?? []).filter((e) => selected.has(e.id)).reduce((s, e) => s + e.amountKurus, 0);
  const allIds = (list ?? []).map((e) => e.id);
  const confirm = () => onConfirm(selected.size === allIds.length ? undefined : allIds.filter((id) => selected.has(id)));

  return (
    <Modal title="Rapora girecek giderler" onClose={onClose} width="w-[640px]"
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Vazgeç</button>
        <button className="btn-primary" disabled={!list} onClick={confirm} data-testid="picker-confirm">
          {kind === 'pdf' ? <FileText size={16} /> : <FileDown size={16} />} {kind === 'pdf' ? 'PDF oluştur' : 'Excel / CSV oluştur'}
        </button>
      </>}>
      {!list ? <p className="text-sm text-slate-500">Yükleniyor…</p> : list.length === 0 ? (
        <p className="text-sm text-slate-500">Bu dönemde gider kaydı yok; rapor yalnızca maliyet ve mesailerle oluşturulur.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span>Seçili: <b data-testid="picker-count">{selected.size}</b> / {list.length} gider · <b className="tabular-nums" data-testid="picker-total">{money(total)}</b></span>
            <span className="ml-auto flex gap-1">
              <button className="btn-link" onClick={() => toggle(allIds, true)}>Hepsini seç</button>
              <button className="btn-link" onClick={() => toggle(allIds, false)}>Hiçbirini seçme</button>
            </span>
          </div>
          <div className="max-h-[55vh] overflow-y-auto rounded border border-slate-200">
            {groups.map(([cat, items]) => {
              const ids = items.map((e) => e.id);
              const on = ids.filter((id) => selected.has(id)).length;
              return (
                <div key={cat} className="border-b border-slate-200 last:border-b-0">
                  <label className="flex cursor-pointer items-center gap-2 bg-slate-50 px-3 py-2 text-sm font-semibold">
                    <input type="checkbox" className="h-4 w-4" checked={on === ids.length}
                      ref={(el) => { if (el) el.indeterminate = on > 0 && on < ids.length; }}
                      onChange={(e) => toggle(ids, e.target.checked)} data-category={cat} />
                    <span className="flex-1">{cat}</span>
                    <span className="text-xs font-normal text-slate-500">{on}/{ids.length} · {money(items.filter((e) => selected.has(e.id)).reduce((s, e) => s + e.amountKurus, 0))}</span>
                  </label>
                  {items.map((e) => (
                    <label key={e.id} className="flex cursor-pointer items-center gap-2 border-t border-slate-100 px-3 py-1.5 pl-8 text-sm hover:bg-brand-50">
                      <input type="checkbox" className="h-4 w-4" checked={selected.has(e.id)} onChange={(ev) => toggle([e.id], ev.target.checked)} data-expense={e.id} />
                      <span className="w-20 shrink-0 text-xs text-slate-500">{formatDate(e.date)}</span>
                      <span className="min-w-0 flex-1 truncate" title={e.name}>{e.name}{e.siteName ? <span className="ml-1 text-xs text-slate-500">· {e.siteName}</span> : null}</span>
                      {!e.isPaid && <span className="rounded bg-amber-100 px-1.5 text-[11px] text-amber-800">Ödenmedi</span>}
                      <span className="tabular-nums">{money(e.amountKurus)}</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">Raporda gider listesi ve gider toplamları yalnızca seçtiğin giderlerle hesaplanır. Personel ve mesai maliyeti değişmez.</p>
        </>
      )}
    </Modal>
  );
}

// Excel benzeri tablo: sütuna tıklayarak sıralama, hücreye tıklayarak düzenleme.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Inbox } from 'lucide-react';
import { moneyToInput, parseMoney } from '../../shared/money';
import { normalizeTime } from '../../shared/overtime';
import { isValidIsoDate } from '../../shared/dates';
import { useIsMobile } from '../lib/useIsMobile';

export type EditType = 'text' | 'money' | 'date' | 'time' | 'integer' | 'select';

export interface CellEdit<T> {
  type: EditType;
  /** Düzenleme kutusuna konacak başlangıç değeri */
  value: (row: T) => string | number | null;
  options?: { value: string; label: string }[];
  /** Yeni değeri kaydeder; hata fırlatırsa değer geri alınır. Para için kuruş, tarih için ISO verilir. */
  save: (row: T, value: string | number) => Promise<void>;
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number | null;
  align?: 'left' | 'right' | 'center';
  width?: string;
  edit?: CellEdit<T>;
  /** Telefon kart görünümünde kartın başlığı olacak sütun (verilmezse ilk sütun) */
  title?: boolean;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  emptyText: ReactNode;
  footer?: ReactNode;
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  onError?: (err: unknown) => void;
  label?: string;
}

const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });

export default function DataTable<T>({ rows, columns, rowKey, emptyText, footer, defaultSort, onError, label }: Props<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(defaultSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const out = [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va === vb) return 0;
      if (va === null || va === '') return 1;
      if (vb === null || vb === '') return -1;
      const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : collator.compare(String(va), String(vb));
      return sort.dir === 'asc' ? c : -c;
    });
    return out;
  }, [rows, columns, sort]);

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const mobile = useIsMobile();
  if (mobile) {
    // Telefon: her kayıt bir kart; ilk sütun kartın başlığı, diğerleri "başlık: değer" satırları.
    const sortable = columns.filter((c) => c.sortValue);
    const head = columns.find((c) => c.title) ?? columns[0];
    const cols = [head, ...columns.filter((c) => c !== head)];
    return (
      <div aria-label={label}>
        {sortable.length > 0 && sorted.length > 1 && (
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
            <span className="shrink-0">Sırala:</span>
            <select className="input" aria-label="Sıralama" value={sort?.key ?? ''} onChange={(e) => setSort(e.target.value ? { key: e.target.value, dir: sort?.dir ?? 'asc' } : null)}>
              <option value="">—</option>
              {sortable.map((c) => <option key={c.key} value={c.key}>{c.header}</option>)}
            </select>
            <button type="button" className="btn-secondary shrink-0" disabled={!sort} onClick={() => sort && toggleSort(sort.key)} aria-label="Sıralama yönü">
              {sort?.dir === 'desc' ? <ArrowDown size={16} /> : <ArrowUp size={16} />}
            </button>
          </div>
        )}
        {sorted.length === 0 ? (
          <div className="card px-4 py-10 text-center text-slate-500">
            <Inbox className="mx-auto mb-2 text-slate-400" size={28} />
            {emptyText}
          </div>
        ) : (
          sorted.map((row) => (
            <table key={rowKey(row)} className="row-card">
              <tbody>
                {cols.map((c, i) => {
                  const plain = i === 0 || !c.header;
                  return (
                    <tr key={c.key} className={i === 0 ? 'row-card-title' : !c.header ? 'row-card-actions' : undefined}>
                      {!plain && <th scope="row">{c.header}</th>}
                      {c.edit ? <EditableCell row={row} col={c} onError={onError} span={plain ? 2 : 1} /> : <td colSpan={plain ? 2 : 1}>{c.render(row)}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))
        )}
        {footer && sorted.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="grid-table"><tfoot>{footer}</tfoot></table>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card overflow-auto">
      <table className="grid-table" aria-label={label}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className={`${c.sortValue ? 'cursor-pointer hover:bg-neutral-700' : ''} ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : ''}`}
                onClick={c.sortValue ? () => toggleSort(c.key) : undefined}
                title={c.sortValue ? 'Sıralamak için tıklayın' : undefined}
              >
                <span className="inline-flex items-center gap-1">
                  {c.header}
                  {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="!py-10 text-center text-slate-500">
                <Inbox className="mx-auto mb-2 text-slate-400" size={28} />
                {emptyText}
              </td>
            </tr>
          ) : (
            sorted.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((c) =>
                  c.edit ? (
                    <EditableCell key={c.key} row={row} col={c} onError={onError} />
                  ) : (
                    <td key={c.key} className={c.align === 'right' ? 'text-right tabular-nums' : c.align === 'center' ? 'text-center' : ''}>
                      {c.render(row)}
                    </td>
                  ),
                )}
              </tr>
            ))
          )}
        </tbody>
        {footer && sorted.length > 0 && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}

function EditableCell<T>({ row, col, onError, span }: { row: T; col: Column<T>; onError?: (err: unknown) => void; span?: number }) {
  const edit = col.edit!;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  // Düzenleme kapandıktan sonra gelen blur olaylarının ikinci kez kaydetmesini önler.
  const closed = useRef(true);

  const close = () => {
    closed.current = true;
    setEditing(false);
  };

  const start = () => {
    closed.current = false;
    const v = edit.value(row);
    setDraft(edit.type === 'money' ? moneyToInput(v as number) : v === null ? '' : String(v));
    setInvalid(null);
    setEditing(true);
  };

  const commit = async (raw: string = draft) => {
    if (busy || closed.current) return;
    const draft = raw;
    let value: string | number = draft;
    if (edit.type === 'money') {
      const k = parseMoney(draft);
      if (k === null || k < 0) return setInvalid('Geçerli bir tutar girin (ör. 1.250,50)');
      value = k;
    } else if (edit.type === 'integer') {
      if (!/^\d+$/.test(draft.trim())) return setInvalid('0 veya pozitif bir tam sayı girin');
      value = Number(draft.trim());
    } else if (edit.type === 'time') {
      const t = normalizeTime(draft);
      if (!t) return setInvalid('Saat SS:DD biçiminde olmalı (ör. 18:30)');
      value = t;
    } else if (edit.type === 'date') {
      if (!isValidIsoDate(draft)) return setInvalid('Geçerli bir tarih seçin');
    }
    const original = edit.value(row);
    if (value === original || (edit.type === 'text' && String(value).trim() === String(original ?? '').trim())) {
      close();
      return;
    }
    setBusy(true);
    try {
      await edit.save(row, value);
      close();
    } catch (err) {
      onError?.(err);
    } finally {
      setBusy(false);
    }
  };

  const alignCls = col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : '';

  if (!editing) {
    return (
      <td colSpan={span} className={`cell-editable ${alignCls}`} onClick={start} title="Düzenlemek için tıklayın">
        {col.render(row)}
      </td>
    );
  }

  const common = {
    autoFocus: true,
    disabled: busy,
    'aria-label': col.header,
    className: `w-full rounded border px-1.5 py-0.5 text-sm outline-none ${invalid ? 'border-red-500' : 'border-brand-500'} ${col.align === 'right' ? 'text-right' : ''}`,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') void commit();
      if (e.key === 'Escape') close();
    },
    onBlur: () => void commit(),
  };

  return (
    <td colSpan={span} className="!p-0.5" title={invalid ?? undefined}>
      {edit.type === 'select' ? (
        <select
          {...common}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            void commit(e.target.value);
          }}
        >
          {edit.options!.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={edit.type === 'date' ? 'date' : edit.type === 'time' ? 'time' : 'text'}
          inputMode={edit.type === 'money' ? 'decimal' : edit.type === 'integer' ? 'numeric' : undefined}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setInvalid(null);
          }}
        />
      )}
      {invalid && <div className="px-1 text-xs text-red-600">{invalid}</div>}
    </td>
  );
}

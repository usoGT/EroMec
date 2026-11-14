import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, Search, Trash2, Wallet } from 'lucide-react';
import type { Category, Employee, Expense, ExpenseFilter, ExpenseInput } from '../../shared/types';
import { formatDate, formatPeriod, monthRange, todayIso } from '../../shared/dates';
import { api } from '../lib/api';
import { useApp } from '../lib/context';
import PageHeader from '../components/PageHeader';
import DataTable, { type Column } from '../components/DataTable';
import DateRangeFilter, { type Range } from '../components/DateRangeFilter';
import ExpenseForm, { OVERTIME_CATEGORY_HINT } from './ExpenseForm';
import SalaryPaymentForm from './SalaryPaymentForm';
import { ScopeSelect } from '../components/SiteSelect';
import { scopeToFilter, useSites } from '../lib/useSites';

const toInput = (x: Expense): ExpenseInput => ({
  date: x.date, name: x.name, categoryId: x.categoryId, amountKurus: x.amountKurus, isPaid: x.isPaid, description: x.description, siteId: x.siteId,
});

export default function ExpensesPage() {
  const { money, toast, confirm, showError } = useApp();
  const [rows, setRows] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [range, setRange] = useState<Range>(monthRange(todayIso()));
  const [categoryId, setCategoryId] = useState(0);
  const [paid, setPaid] = useState<'' | 'paid' | 'unpaid'>('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [scope, setScope] = useState('');
  const { companies, sites } = useSites();
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const filter: ExpenseFilter = {
        from: range.from || undefined, to: range.to || undefined,
        categoryId: categoryId || undefined, paid: paid || undefined, search: search || undefined, ...scopeToFilter(scope),
      };
      const [cats, list, emps] = await Promise.all([api.categoriesList(), api.expensesList(filter), api.employeesList()]);
      setCategories(cats);
      setRows(list);
      setEmployees(emps);
      setLoaded(true);
    } catch (e) {
      showError(e);
    }
  }, [range, categoryId, paid, search, scope, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (x: Expense, change: Partial<ExpenseInput>) => {
    await api.expenseUpdate({ id: x.id, input: { ...toInput(x), ...change } });
    toast('Gider güncellendi.');
    await load();
  };

  const remove = async (x: Expense) => {
    const ok = await confirm({
      title: 'Gideri sil',
      message: <>{formatDate(x.date)} tarihli “<b>{x.name}</b>” ({money(x.amountKurus)}) gideri silinsin mi?</>,
      confirmText: 'Sil',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.expenseDelete(x.id);
      toast('Gider silindi.');
      await load();
    } catch (e) {
      showError(e);
    }
  };

  const columns: Column<Expense>[] = [
    {
      key: 'date', header: 'Tarih', width: '110px', sortValue: (r) => r.date, render: (r) => formatDate(r.date),
      edit: { type: 'date', value: (r) => r.date, save: (r, v) => patch(r, { date: String(v) }) },
    },
    {
      key: 'name', header: 'Gider adı', title: true, sortValue: (r) => r.name,
      render: (r) => <span className="font-medium">{r.name}{r.salaryPeriod && <span className="ml-1 rounded bg-brand-50 px-1 text-xs font-normal text-brand-700" title="Maaş ödemesi">{formatPeriod(r.salaryPeriod)}</span>}</span>,
      edit: { type: 'text', value: (r) => r.name, save: (r, v) => patch(r, { name: String(v) }) },
    },
    {
      key: 'category', header: 'Kategori', width: '190px', sortValue: (r) => r.categoryName,
      render: (r) => <span title={r.categoryKind === 'overtime' ? OVERTIME_CATEGORY_HINT : undefined}>{r.categoryName}{r.categoryKind === 'overtime' && <span className="text-amber-700"> *</span>}</span>,
      edit: {
        type: 'select', value: (r) => String(r.categoryId),
        options: categories.map((c) => ({ value: String(c.id), label: c.name })),
        save: (r, v) => patch(r, { categoryId: Number(v) }),
      },
    },
    {
      key: 'site', header: 'Şantiye', width: '150px', sortValue: (r) => r.siteName, render: (r) => r.siteName ?? <span className="text-slate-400">Genel</span>,
      edit: {
        type: 'select', value: (r) => String(r.siteId ?? 0),
        options: [{ value: '0', label: 'Genel (şantiyesiz)' }, ...sites.map((s) => ({ value: String(s.id), label: `${s.companyName} / ${s.name}` }))],
        save: (r, v) => patch(r, { siteId: Number(v) || null }),
      },
    },
    {
      key: 'amount', header: 'Tutar', width: '130px', align: 'right', sortValue: (r) => r.amountKurus, render: (r) => money(r.amountKurus),
      edit: { type: 'money', value: (r) => r.amountKurus, save: (r, v) => patch(r, { amountKurus: Number(v) }) },
    },
    {
      key: 'paid', header: 'Ödeme durumu', width: '120px', sortValue: (r) => (r.isPaid ? 1 : 0),
      render: (r) => (
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${r.isPaid ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
          {r.isPaid ? 'Ödendi' : 'Ödenmedi'}
        </span>
      ),
      edit: {
        type: 'select', value: (r) => (r.isPaid ? '1' : '0'),
        options: [{ value: '1', label: 'Ödendi' }, { value: '0', label: 'Ödenmedi' }],
        save: (r, v) => patch(r, { isPaid: v === '1' }),
      },
    },
    {
      key: 'desc', header: 'Açıklama', sortValue: (r) => r.description, render: (r) => r.description,
      edit: { type: 'text', value: (r) => r.description, save: (r, v) => patch(r, { description: String(v) }) },
    },
    {
      key: 'actions', header: 'İşlemler', width: '150px',
      render: (r) => (
        <div className="flex gap-1">
          <button className="btn-link" onClick={() => setEditing(r)}><Pencil size={14} /> Düzenle</button>
          <button className="btn-link-danger" onClick={() => void remove(r)}><Trash2 size={14} /> Sil</button>
        </div>
      ),
    },
  ];

  const total = rows.reduce((s, r) => s + r.amountKurus, 0);
  const paidTotal = rows.filter((r) => r.isPaid).reduce((s, r) => s + r.amountKurus, 0);

  return (
    <div>
      <PageHeader
        title="Giderler"
        description="Bütün giderler tek tabloda. Hücrelere tıklayarak düzenleyebilir, sütun başlıklarıyla sıralayabilirsiniz."
        actions={
          <>
            <button className="btn-secondary" onClick={() => setSalaryOpen(true)}><Wallet size={16} /> Maaş ödemesi kaydet</button>
            <button className="btn-primary" onClick={() => setEditing('new')}><Plus size={16} /> Yeni gider</button>
          </>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-64">
          <Search size={16} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input className="input pl-8" placeholder="Gider adında ara…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Gider ara" />
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
        <select className="input w-52" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))} aria-label="Kategori filtresi">
          <option value={0}>Tüm kategoriler</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-40" value={paid} onChange={(e) => setPaid(e.target.value as '' | 'paid' | 'unpaid')} aria-label="Ödeme durumu filtresi">
          <option value="">Tüm durumlar</option>
          <option value="paid">Ödendi</option>
          <option value="unpaid">Ödenmedi</option>
        </select>
        <ScopeSelect companies={companies} sites={sites} value={scope} onChange={setScope} />
      </div>
      <DataTable
        label="Giderler"
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        onError={showError}
        defaultSort={{ key: 'date', dir: 'desc' }}
        emptyText={!loaded ? 'Yükleniyor…' : 'Seçilen filtrelere uygun gider yok. “Yeni gider” ile ekleyebilirsiniz.'}
        footer={
          <tr>
            <td colSpan={4} data-testid="expense-total-label">Filtrelenen {rows.length} kaydın toplamı</td>
            <td className="text-right tabular-nums" data-testid="expense-total">{money(total)}</td>
            <td colSpan={3} className="font-normal">
              Ödenen: <b>{money(paidTotal)}</b> · Ödenmemiş: <b className="text-amber-700">{money(total - paidTotal)}</b>
            </td>
          </tr>
        }
      />
      {rows.some((r) => r.categoryKind === 'overtime') && <p className="mt-2 text-xs text-slate-500"><span className="text-amber-700">*</span> {OVERTIME_CATEGORY_HINT}</p>}
      {editing && <ExpenseForm expense={editing === 'new' ? undefined : editing} categories={categories} sites={sites} initialSiteId={scopeToFilter(scope).siteId ?? null} onClose={() => setEditing(null)} onSaved={load} />}
      {salaryOpen && <SalaryPaymentForm employees={employees} onClose={() => setSalaryOpen(false)} onSaved={load} />}
    </div>
  );
}

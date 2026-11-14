import { useState } from 'react';
import type { Category, Expense, Site } from '../../shared/types';
import { todayIso } from '../../shared/dates';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/context';
import Modal from '../components/Modal';
import { Field, FormError, MoneyInput } from '../components/Fields';
import { SiteSelect } from '../components/SiteSelect';

export const OVERTIME_CATEGORY_HINT =
  'Mesai maliyeti Mesailer bölümündeki kayıtlardan otomatik hesaplanır. Bu kategoriyi yalnızca mesai ödemesini takip etmek için kullanın; raporlarda toplam gidere ikinci kez eklenmez.';

export default function ExpenseForm({ expense, categories, sites, initialDate, initialSiteId, onClose, onSaved }: {
  expense?: Expense; categories: Category[]; sites: Site[]; initialDate?: string; initialSiteId?: number | null; onClose: () => void; onSaved: () => void;
}) {
  const { toast, confirm } = useApp();
  const [date, setDate] = useState(expense?.date ?? initialDate ?? todayIso());
  const [siteId, setSiteId] = useState<number | null>(expense ? expense.siteId : initialSiteId ?? null);
  const [name, setName] = useState(expense?.name ?? '');
  const [categoryId, setCategoryId] = useState<number>(expense?.categoryId ?? categories.find((c) => c.kind === 'other')?.id ?? categories[0]?.id ?? 0);
  const [amount, setAmount] = useState<number | null>(expense?.amountKurus ?? null);
  const [amountRaw, setAmountRaw] = useState('');
  const [isPaid, setIsPaid] = useState(expense?.isPaid ?? true);
  const [description, setDescription] = useState(expense?.description ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const category = categories.find((c) => c.id === categoryId);

  const submit = async () => {
    if (saving) return;
    const e: Record<string, string> = {};
    if (!date) e.date = 'Tarih seçin.';
    if (!categoryId) e.category = 'Kategori seçin.';
    if (amount === null) e.amount = amountRaw.trim() ? 'Geçerli bir tutar girin (ör. 1.250,50).' : 'Tutar girin.';
    else if (amount < 0) e.amount = 'Tutar negatif olamaz.';
    setErrors(e);
    if (Object.keys(e).length) return;
    const input = { date, name, categoryId, amountKurus: amount!, isPaid, description, siteId };
    setSaving(true);
    setFormError(null);
    try {
      if (expense) {
        await api.expenseUpdate({ id: expense.id, input });
        toast('Gider güncellendi.');
      } else {
        let res = await api.expenseCreate({ input });
        if (res.duplicate) {
          const ok = await confirm({ title: 'Aynı gider zaten var', message: res.duplicate, confirmText: 'Yine de ekle' });
          if (!ok) return;
          res = await api.expenseCreate({ input, force: true });
        }
        toast('Gider eklendi.');
      }
      onSaved();
      onClose();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={expense ? 'Gideri düzenle' : 'Yeni gider'}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn-primary" onClick={() => void submit()} disabled={saving}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </>
      }
    >
      <FormError message={formError} />
      <form className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2" onSubmit={(ev) => { ev.preventDefault(); void submit(); }} noValidate>
        <Field label="Tarih" required error={errors.date}>
          <input name="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Tutar" required error={errors.amount}>
          <MoneyInput name="amount" value={amount} invalid={!!errors.amount} onChange={(k, raw) => { setAmount(k); setAmountRaw(raw); }} autoFocus />
        </Field>
        <Field label="Kategori" required error={errors.category}>
          <select name="category" className="input" value={categoryId} onChange={(e) => setCategoryId(Number(e.target.value))}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Ödeme durumu">
          <select name="paid" className="input" value={isPaid ? '1' : '0'} onChange={(e) => setIsPaid(e.target.value === '1')}>
            <option value="1">Ödendi</option>
            <option value="0">Ödenmedi</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Şantiye" hint="Gider belirli bir şantiyeye aitse seçin; genel giderlerde boş bırakın.">
            <SiteSelect sites={sites} value={siteId} onChange={setSiteId} emptyLabel="— Genel (şantiyesiz) —" />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Gider adı" hint="Boş bırakırsanız kategori adı kullanılır.">
            <input name="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder={category?.name} />
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="Açıklama">
            <input name="description" className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </Field>
        </div>
        {category?.kind === 'overtime' && <p className="sm:col-span-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{OVERTIME_CATEGORY_HINT}</p>}
        {category?.kind === 'salary' && !expense && (
          <p className="sm:col-span-2 rounded bg-brand-50 px-3 py-2 text-xs text-brand-700">
            Çalışana ve aya bağlı maaş ödemesi için “Maaş ödemesi kaydet” düğmesini kullanmanız önerilir; böylece aynı ay iki kez kaydedilemez.
          </p>
        )}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

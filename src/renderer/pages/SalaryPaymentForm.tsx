import { useMemo, useState } from 'react';
import type { Employee } from '../../shared/types';
import { MONTH_NAMES, todayIso } from '../../shared/dates';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/context';
import Modal from '../components/Modal';
import { Field, FormError, MoneyInput } from '../components/Fields';

/**
 * Maaş ödemesi kaydı. Maaşlar otomatik oluşturulmaz; kullanıcı açıkça kaydeder.
 * Aynı çalışana aynı ay için ikinci kayıt veritabanı tarafından engellenir.
 */
export default function SalaryPaymentForm({ employees, employeeId, onClose, onSaved }: {
  employees: Employee[]; employeeId?: number; onClose: () => void; onSaved: () => void;
}) {
  const { toast } = useApp();
  const today = todayIso();
  const active = useMemo(() => employees.filter((e) => e.status === 'active' || e.id === employeeId), [employees, employeeId]);
  const [empId, setEmpId] = useState<number>(employeeId ?? active[0]?.id ?? 0);
  const emp = employees.find((e) => e.id === empId);
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)));
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState<number | null>(emp?.monthlySalaryKurus || null);
  const [isPaid, setIsPaid] = useState(true);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (!empId) return setError('Çalışan seçin.');
    if (amount === null || amount <= 0) return setError('Geçerli bir maaş tutarı girin.');
    if (!date) return setError('Ödeme tarihini seçin.');
    setSaving(true);
    setError(null);
    try {
      const period = `${year}-${String(month).padStart(2, '0')}`;
      const x = await api.salaryPaymentCreate({ employeeId: empId, period, date, amountKurus: amount, isPaid, description });
      toast(`${x.name} kaydedildi.`);
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const years = [year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <Modal
      title="Maaş ödemesi kaydet"
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn-primary" onClick={() => void submit()} disabled={saving}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </>
      }
    >
      <FormError message={error} />
      {active.length === 0 ? (
        <p className="text-sm text-slate-600">Önce Çalışanlar bölümünden bir çalışan ekleyin.</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Çalışan" required>
              <select className="input" value={empId} onChange={(e) => {
                const id = Number(e.target.value);
                setEmpId(id);
                setAmount(employees.find((x) => x.id === id)?.monthlySalaryKurus || null);
              }}>
                {active.map((e) => <option key={e.id} value={e.id}>{e.fullName} — {e.position}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Maaş dönemi (ay)" required>
            <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
          <Field label="Yıl" required>
            <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Tutar" required hint="Çalışan kartındaki aylık maaş önerilir, değiştirebilirsiniz.">
            <MoneyInput value={amount} onChange={(k) => setAmount(k)} />
          </Field>
          <Field label="Ödeme tarihi" required>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Ödeme durumu">
            <select className="input" value={isPaid ? '1' : '0'} onChange={(e) => setIsPaid(e.target.value === '1')}>
              <option value="1">Ödendi</option>
              <option value="0">Ödenmedi</option>
            </select>
          </Field>
          <Field label="Açıklama">
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </Field>
          <p className="sm:col-span-2 text-xs text-slate-500">
            Kayıt Giderler tablosuna “Personel maaşı” kategorisinde eklenir. Aynı çalışana aynı ay için ikinci maaş kaydı açılamaz.
          </p>
        </div>
      )}
    </Modal>
  );
}

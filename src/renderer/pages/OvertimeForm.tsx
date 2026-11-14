import { useMemo, useState } from 'react';
import type { Employee, OvertimeRecord, Site } from '../../shared/types';
import { todayIso } from '../../shared/dates';
import { calculateOvertime, formatHoursDecimal, formatMinutes } from '../../shared/overtime';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/context';
import Modal from '../components/Modal';
import { Field, FormError, MoneyInput } from '../components/Fields';
import { SiteSelect } from '../components/SiteSelect';

export default function OvertimeForm({ record, employees, sites, initialDate, onClose, onSaved }: {
  record?: OvertimeRecord; employees: Employee[]; sites: Site[]; initialDate?: string; onClose: () => void; onSaved: () => void;
}) {
  const { money, toast, confirm } = useApp();
  // Yeni kayıtta yalnızca aktif çalışanlar; düzenlemede kaydın çalışanı da listede olur.
  const options = useMemo(() => employees.filter((e) => e.status === 'active' || e.id === record?.employeeId), [employees, record]);
  const [employeeId, setEmployeeId] = useState<number>(record?.employeeId ?? 0);
  const [date, setDate] = useState(record?.date ?? initialDate ?? todayIso());
  const [siteId, setSiteId] = useState<number | null>(record?.siteId ?? null);
  const [startTime, setStartTime] = useState(record?.startTime ?? '');
  const [endTime, setEndTime] = useState(record?.endTime ?? '');
  const [breakMinutes, setBreakMinutes] = useState(String(record?.breakMinutes ?? 0));
  const [rate, setRate] = useState<number | null>(record?.hourlyRateKurus ?? null);
  const [description, setDescription] = useState(record?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectEmployee = (id: number) => {
    setEmployeeId(id);
    // Saatlik ücret, çalışanın varsayılan ücretiyle doldurulur; kullanıcı değiştirebilir.
    const emp = employees.find((e) => e.id === id);
    if (emp) {
      setRate(emp.overtimeRateKurus);
      setSiteId(emp.siteId); // mesai, çalışanın şantiyesine yazılır; değiştirilebilir
    }
  };

  const preview = useMemo(() => {
    if (!startTime || !endTime) return null;
    if (!/^\d+$/.test(breakMinutes.trim())) return { error: 'Mola süresi dakika olarak tam sayı olmalıdır.' };
    try {
      const r = calculateOvertime({ startTime, endTime, breakMinutes: Number(breakMinutes), hourlyRateKurus: rate ?? 0 });
      return { ...r };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [startTime, endTime, breakMinutes, rate]);

  const submit = async () => {
    if (saving) return;
    if (!employeeId) return setError('Çalışan seçin.');
    if (!date) return setError('Tarih seçin.');
    if (!startTime || !endTime) return setError('Başlangıç ve bitiş saatini girin.');
    if (rate === null || rate < 0) return setError('Geçerli bir saatlik mesai ücreti girin.');
    if (preview && 'error' in preview) return setError(preview.error ?? null);
    const input = { employeeId, siteId, date, startTime, endTime, breakMinutes: Number(breakMinutes), hourlyRateKurus: rate, description };
    setSaving(true);
    setError(null);
    try {
      if (record) {
        await api.overtimeUpdate({ id: record.id, input });
        toast('Mesai kaydı güncellendi.');
      } else {
        let res = await api.overtimeCreate({ input });
        if (res.duplicate) {
          const ok = await confirm({ title: 'Aynı gün başka mesai var', message: res.duplicate, confirmText: 'Yine de ekle' });
          if (!ok) return;
          res = await api.overtimeCreate({ input, force: true });
        }
        toast('Mesai kaydı eklendi.');
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
    <Modal
      title={record ? 'Mesai kaydını düzenle' : 'Yeni mesai'}
      onClose={onClose}
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn-primary" onClick={() => void submit()} disabled={saving || options.length === 0}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </>
      }
    >
      <FormError message={error} />
      {options.length === 0 ? (
        <p className="text-sm text-slate-600">Mesai eklemek için önce Çalışanlar bölümünden aktif bir çalışan ekleyin.</p>
      ) : (
        <form className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
          <div className="sm:col-span-2">
            <Field label="Çalışan" required>
              <select name="employee" className="input" value={employeeId} onChange={(e) => selectEmployee(Number(e.target.value))} autoFocus>
                <option value={0}>— Çalışan seçin —</option>
                {options.map((e) => <option key={e.id} value={e.id}>{e.fullName} — {e.position}</option>)}
              </select>
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Şantiye" hint="Çalışanın bağlı olduğu şantiye gelir; bu mesai başka şantiyede yapıldıysa değiştirin.">
              <SiteSelect sites={sites} value={siteId} onChange={setSiteId} />
            </Field>
          </div>
          <Field label="Tarih" required>
            <input name="date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Saatlik mesai ücreti" required hint="Çalışanın varsayılan ücreti gelir; bu kayıt için değiştirebilirsiniz.">
            <MoneyInput name="rate" value={rate} onChange={(k) => setRate(k)} />
          </Field>
          <Field label="Başlangıç saati" required>
            <input name="startTime" type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="Bitiş saati" required hint="Bitiş başlangıçtan önceyse ertesi gün kabul edilir.">
            <input name="endTime" type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
          <Field label="Mola süresi (dakika)">
            <input name="breakMinutes" className="input" inputMode="numeric" value={breakMinutes} onChange={(e) => setBreakMinutes(e.target.value)} />
          </Field>
          <Field label="Açıklama">
            <input name="description" className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </Field>
          <div className="sm:col-span-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm" data-testid="overtime-preview">
            {!preview ? (
              <span className="text-slate-500">Saatleri girdiğinizde toplam süre ve tutar burada hesaplanır.</span>
            ) : 'error' in preview ? (
              <span className="text-red-700">{preview.error}</span>
            ) : (
              <span>
                Toplam mesai: <b>{formatMinutes(preview.workedMinutes)}</b> ({formatHoursDecimal(preview.workedMinutes)} saat)
                {preview.crossesMidnight && <span className="text-amber-700"> · gece yarısını aşıyor</span>}
                {' '}· Toplam tutar: <b>{money(preview.totalKurus)}</b>
              </span>
            )}
          </div>
          <button type="submit" className="hidden" />
        </form>
      )}
    </Modal>
  );
}

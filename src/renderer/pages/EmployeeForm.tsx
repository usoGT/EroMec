import { useState } from 'react';
import type { Employee, EmployeeInput, Site } from '../../shared/types';
import { BLOOD_TYPES, formatIban, isValidIban, isValidNationalId } from '../../shared/identity';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/context';
import Modal from '../components/Modal';
import { Field, FormError, MoneyInput } from '../components/Fields';
import { SiteSelect } from '../components/SiteSelect';

interface Props {
  employee?: Employee;
  sites: Site[];
  onClose: () => void;
  onSaved: () => void;
}

type Tab = 'general' | 'identity' | 'contact';
const TABS: [Tab, string][] = [['general', 'Genel bilgiler'], ['identity', 'Kimlik ve banka'], ['contact', 'İletişim ve acil durum']];

export default function EmployeeForm({ employee, sites, onClose, onSaved }: Props) {
  const { toast, confirm } = useApp();
  const [tab, setTab] = useState<Tab>('general');
  const [f, setF] = useState({
    fullName: employee?.fullName ?? '',
    position: employee?.position ?? '',
    startDate: employee?.startDate ?? '',
    status: employee?.status ?? 'active',
    siteId: employee?.siteId ?? null,
    phone: employee?.phone ?? '',
    notes: employee?.notes ?? '',
    nationalId: employee?.nationalId ?? '',
    iban: employee?.iban ? formatIban(employee.iban) : '',
    bankName: employee?.bankName ?? '',
    birthDate: employee?.birthDate ?? '',
    sgkNo: employee?.sgkNo ?? '',
    bloodType: employee?.bloodType ?? '',
    address: employee?.address ?? '',
    emergencyName: employee?.emergencyName ?? '',
    emergencyPhone: employee?.emergencyPhone ?? '',
  });
  const [salary, setSalary] = useState<number | null>(employee?.monthlySalaryKurus ?? null);
  const [salaryRaw, setSalaryRaw] = useState('');
  const [rate, setRate] = useState<number | null>(employee?.overtimeRateKurus ?? null);
  const [rateRaw, setRateRaw] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  // Hangi alan hangi sekmede: hata olunca ilgili sekme açılır
  const tabOf: Record<string, Tab> = { fullName: 'general', position: 'general', salary: 'general', rate: 'general', nationalId: 'identity', iban: 'identity' };

  const validate = (): EmployeeInput | null => {
    const e: Record<string, string> = {};
    if (!f.fullName.trim()) e.fullName = 'Ad soyad zorunludur.';
    if (!f.position.trim()) e.position = 'Görev zorunludur.';
    if (salary === null && salaryRaw.trim() !== '') e.salary = 'Geçerli bir tutar girin (ör. 25.000 veya 25000,50).';
    if (rate === null && rateRaw.trim() !== '') e.rate = 'Geçerli bir tutar girin (ör. 150 veya 150,50).';
    if (f.nationalId.trim() && !isValidNationalId(f.nationalId.trim())) e.nationalId = 'T.C. kimlik numarası geçersiz (11 hane olmalı ve kontrol hanesi tutmalı).';
    if (f.iban.trim() && !isValidIban(f.iban)) e.iban = 'IBAN geçersiz. TR ile başlayan 26 karakter olmalı.';
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      setTab(tabOf[first] ?? 'general');
      return null;
    }
    return {
      ...f,
      nationalId: f.nationalId.trim(),
      monthlySalaryKurus: salary ?? 0,
      overtimeRateKurus: rate ?? 0,
      startDate: f.startDate || null,
      birthDate: f.birthDate || null,
      status: f.status as 'active' | 'left',
    };
  };

  const submit = async (ev?: React.FormEvent) => {
    ev?.preventDefault();
    if (saving) return;
    const input = validate();
    if (!input) return;
    setSaving(true);
    setFormError(null);
    try {
      if (employee) {
        await api.employeeUpdate({ id: employee.id, input });
        toast('Çalışan bilgileri güncellendi.');
      } else {
        let res = await api.employeeCreate({ input });
        if (res.duplicate) {
          const ok = await confirm({ title: 'Benzer kayıt var', message: res.duplicate, confirmText: 'Yine de ekle' });
          if (!ok) return;
          res = await api.employeeCreate({ input, force: true });
        }
        toast(`${res.item!.fullName} eklendi (${res.item!.employeeNo}).`);
      }
      onSaved();
      onClose();
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => (errors[k] ? 'input-error' : '');

  return (
    <Modal
      title={employee ? `Çalışanı düzenle — ${employee.employeeNo}` : 'Yeni çalışan'}
      onClose={onClose}
      width="w-[640px]"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Vazgeç</button>
          <button className="btn-primary" onClick={() => void submit()} disabled={saving}>{saving ? 'Kaydediliyor…' : 'Kaydet'}</button>
        </>
      }
    >
      <FormError message={formError} />
      <div className="mb-4 flex border-b border-slate-200" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-3 py-1.5 text-sm ${tab === k ? 'border-brand-600 font-semibold text-brand-700' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>
            {label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} noValidate>
        <div className={`grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 ${tab === 'general' ? '' : 'hidden'}`}>
          <div className="sm:col-span-2">
            <Field label="Ad soyad" required error={errors.fullName}>
              <input name="fullName" className={`input ${err('fullName')}`} value={f.fullName} onChange={set('fullName')} autoFocus maxLength={100} />
            </Field>
          </div>
          <Field label="Görev" required error={errors.position}>
            <input name="position" className={`input ${err('position')}`} value={f.position} onChange={set('position')} placeholder="ör. Usta, Kaynakçı" maxLength={100} />
          </Field>
          <Field label="Şantiye">
            <SiteSelect sites={sites} value={f.siteId} onChange={(v) => setF({ ...f, siteId: v })} />
          </Field>
          <Field label="Aylık maaş" error={errors.salary} hint="Bilgi amaçlıdır; ödeme yapınca “Maaş ödemesi” kaydedin.">
            <MoneyInput name="salary" value={salary} invalid={!!errors.salary} onChange={(k, raw) => { setSalary(k); setSalaryRaw(raw); }} />
          </Field>
          <Field label="Saatlik mesai ücreti" error={errors.rate} hint="Yeni mesai kayıtlarında varsayılan olarak kullanılır.">
            <MoneyInput name="rate" value={rate} invalid={!!errors.rate} onChange={(k, raw) => { setRate(k); setRateRaw(raw); }} />
          </Field>
          <Field label="İşe başlama tarihi">
            <input name="startDate" type="date" className="input" value={f.startDate} onChange={set('startDate')} />
          </Field>
          <Field label="Durum">
            <select name="status" className="input" value={f.status} onChange={set('status')}>
              <option value="active">Aktif</option>
              <option value="left">Ayrıldı</option>
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notlar"><textarea name="notes" className="input" rows={2} value={f.notes} onChange={set('notes')} maxLength={1000} /></Field>
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 ${tab === 'identity' ? '' : 'hidden'}`}>
          <Field label="T.C. kimlik no" error={errors.nationalId}>
            <input name="nationalId" className={`input font-mono ${err('nationalId')}`} value={f.nationalId} onChange={set('nationalId')} inputMode="numeric" maxLength={11} placeholder="11 hane" />
          </Field>
          <Field label="Doğum tarihi">
            <input name="birthDate" type="date" className="input" value={f.birthDate} onChange={set('birthDate')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="IBAN" error={errors.iban}>
              <input name="iban" className={`input font-mono ${err('iban')}`} value={f.iban} onChange={set('iban')} onBlur={() => isValidIban(f.iban) && setF({ ...f, iban: formatIban(f.iban) })} maxLength={34} placeholder="TR00 0000 0000 0000 0000 0000 00" />
            </Field>
          </div>
          <Field label="Banka adı"><input name="bankName" className="input" value={f.bankName} onChange={set('bankName')} maxLength={80} /></Field>
          <Field label="SGK sicil no"><input name="sgkNo" className="input" value={f.sgkNo} onChange={set('sgkNo')} maxLength={30} /></Field>
          <Field label="Kan grubu">
            <select name="bloodType" className="input" value={f.bloodType} onChange={set('bloodType')}>
              <option value="">— Seçilmedi —</option>
              {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </Field>
        </div>

        <div className={`grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 ${tab === 'contact' ? '' : 'hidden'}`}>
          <Field label="Telefon"><input name="phone" className="input" value={f.phone} onChange={set('phone')} maxLength={30} /></Field>
          <div />
          <div className="sm:col-span-2">
            <Field label="Adres"><textarea name="address" className="input" rows={2} value={f.address} onChange={set('address')} maxLength={300} /></Field>
          </div>
          <Field label="Acil durumda aranacak kişi"><input name="emergencyName" className="input" value={f.emergencyName} onChange={set('emergencyName')} maxLength={100} /></Field>
          <Field label="Acil durum telefonu"><input name="emergencyPhone" className="input" value={f.emergencyPhone} onChange={set('emergencyPhone')} maxLength={30} /></Field>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

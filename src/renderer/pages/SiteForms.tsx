import { useState } from 'react';
import type { Company, CompanyInput, Site, SiteInput } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { useApp } from '../lib/context';
import Modal from '../components/Modal';
import { Field, FormError } from '../components/Fields';

export function CompanyForm({ company, onClose, onSaved }: { company?: Company; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState<CompanyInput>({
    name: company?.name ?? '', taxOffice: company?.taxOffice ?? '', taxNo: company?.taxNo ?? '',
    phone: company?.phone ?? '', address: company?.address ?? '', notes: company?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof CompanyInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });

  const submit = async () => {
    if (saving) return;
    if (!f.name.trim()) return setError('Firma adı zorunludur.');
    setSaving(true);
    setError(null);
    try {
      await api.companySave({ id: company?.id, input: f });
      toast(company ? 'Firma güncellendi.' : 'Firma eklendi.');
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={company ? 'Firmayı düzenle' : 'Yeni firma'} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Vazgeç</button><button className="btn-primary" onClick={() => void submit()} disabled={saving}>Kaydet</button></>}>
      <FormError message={error} />
      <form className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <div className="sm:col-span-2"><Field label="Firma adı" required><input name="name" className="input" value={f.name} onChange={set('name')} autoFocus maxLength={120} /></Field></div>
        <Field label="Vergi dairesi"><input name="taxOffice" className="input" value={f.taxOffice} onChange={set('taxOffice')} maxLength={80} /></Field>
        <Field label="Vergi no"><input name="taxNo" className="input" value={f.taxNo} onChange={set('taxNo')} inputMode="numeric" maxLength={11} /></Field>
        <Field label="Telefon"><input name="phone" className="input" value={f.phone} onChange={set('phone')} maxLength={30} /></Field>
        <Field label="Adres"><input name="address" className="input" value={f.address} onChange={set('address')} maxLength={300} /></Field>
        <div className="sm:col-span-2"><Field label="Notlar"><textarea name="notes" className="input" rows={2} value={f.notes} onChange={set('notes')} maxLength={1000} /></Field></div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

export function SiteForm({ site, companies, onClose, onSaved }: { site?: Site; companies: Company[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useApp();
  const [f, setF] = useState<SiteInput>({
    companyId: site?.companyId ?? companies[0]?.id ?? 0, name: site?.name ?? '', address: site?.address ?? '',
    startDate: site?.startDate ?? null, endDate: site?.endDate ?? null, status: site?.status ?? 'active', notes: site?.notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (saving) return;
    if (!f.companyId) return setError('Firma seçin. Önce “Yeni firma” ile firma ekleyin.');
    if (!f.name.trim()) return setError('Şantiye adı zorunludur.');
    setSaving(true);
    setError(null);
    try {
      await api.siteSave({ id: site?.id, input: f });
      toast(site ? 'Şantiye güncellendi.' : 'Şantiye eklendi.');
      onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={site ? 'Şantiyeyi düzenle' : 'Yeni şantiye'} onClose={onClose}
      footer={<><button className="btn-secondary" onClick={onClose}>Vazgeç</button><button className="btn-primary" onClick={() => void submit()} disabled={saving}>Kaydet</button></>}>
      <FormError message={error} />
      <form className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
        <Field label="Firma (ana firma / işveren)" required>
          <select name="company" className="input" value={f.companyId} onChange={(e) => setF({ ...f, companyId: Number(e.target.value) })}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Şantiye adı" required><input name="name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus maxLength={120} /></Field>
        <div className="sm:col-span-2"><Field label="Adres"><input name="address" className="input" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} maxLength={300} /></Field></div>
        <Field label="Başlangıç tarihi"><input name="startDate" type="date" className="input" value={f.startDate ?? ''} onChange={(e) => setF({ ...f, startDate: e.target.value || null })} /></Field>
        <Field label="Bitiş tarihi"><input name="endDate" type="date" className="input" value={f.endDate ?? ''} onChange={(e) => setF({ ...f, endDate: e.target.value || null })} /></Field>
        <Field label="Durum">
          <select name="status" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as SiteInput['status'] })}>
            <option value="active">Devam ediyor</option>
            <option value="completed">Tamamlandı</option>
          </select>
        </Field>
        <Field label="Notlar"><input name="notes" className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} /></Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

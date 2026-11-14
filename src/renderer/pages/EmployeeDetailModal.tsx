import { useCallback, useEffect, useState } from 'react';
import { Pencil, Wallet } from 'lucide-react';
import type { Employee, EmployeeDetail } from '../../shared/types';
import { formatDate, formatPeriod } from '../../shared/dates';
import { formatMinutes } from '../../shared/overtime';
import { formatIban } from '../../shared/identity';
import { api } from '../lib/api';
import { useApp } from '../lib/context';
import Modal from '../components/Modal';
import SalaryPaymentForm from './SalaryPaymentForm';
import StatusBadge from '../components/StatusBadge';

export default function EmployeeDetailModal({ employeeId, employees, onClose, onChanged, onEdit }: {
  employeeId: number; employees: Employee[]; onClose: () => void; onChanged: () => void; onEdit: (e: Employee) => void;
}) {
  const { money, showError } = useApp();
  const [d, setD] = useState<EmployeeDetail | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setD(await api.employeeGet(employeeId));
    } catch (e) {
      showError(e);
    }
  }, [employeeId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!d) return null;
  const e = d.employee;
  const info: [string, React.ReactNode][] = [
    ['Çalışan No', e.employeeNo],
    ['Görev', e.position],
    ['Şantiye', e.siteName ? `${e.companyName} / ${e.siteName}` : '—'],
    ['T.C. kimlik no', e.nationalId || '—'],
    ['IBAN', e.iban ? <span key="i" className="font-mono">{formatIban(e.iban)}</span> : '—'],
    ['Banka', e.bankName || '—'],
    ['Doğum tarihi', formatDate(e.birthDate) || '—'],
    ['SGK sicil no', e.sgkNo || '—'],
    ['Kan grubu', e.bloodType || '—'],
    ['Adres', e.address || '—'],
    ['Acil durum kişisi', [e.emergencyName, e.emergencyPhone].filter(Boolean).join(' · ') || '—'],
    ['Durum', <StatusBadge key="s" status={e.status} />],
    ['İşe başlama', formatDate(e.startDate) || '—'],
    ['Aylık maaş', money(e.monthlySalaryKurus)],
    ['Saatlik mesai ücreti', money(e.overtimeRateKurus)],
    ['Telefon', e.phone || '—'],
    ['Notlar', e.notes || '—'],
  ];

  return (
    <>
      <Modal
        title={`Çalışan detayı — ${e.fullName}`}
        onClose={onClose}
        width="w-[760px]"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPayOpen(true)}><Wallet size={15} /> Maaş ödemesi kaydet</button>
            <button className="btn-secondary" onClick={() => onEdit(e)}><Pencil size={15} /> Düzenle</button>
            <button className="btn-primary" onClick={onClose}>Kapat</button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 gap-y-1.5 text-sm">
          {info.map(([k, v]) => (
            <div key={k} className="flex border-b border-slate-100 py-1">
              <span className="w-32 shrink-0 sm:w-40 text-slate-500">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
          <div className="card px-3 py-2"><div className="text-slate-500">Mesai kaydı</div><div className="text-lg font-semibold">{d.overtimeCount}</div></div>
          <div className="card px-3 py-2"><div className="text-slate-500">Toplam mesai</div><div className="text-lg font-semibold">{formatMinutes(d.overtimeMinutesTotal)} · {money(d.overtimeKurusTotal)}</div></div>
          <div className="card px-3 py-2"><div className="text-slate-500">Kaydedilen maaş ödemeleri</div><div className="text-lg font-semibold">{d.salaryPaymentCount} · {money(d.salaryPaidKurusTotal)}</div></div>
        </div>

        <h3 className="mb-1 mt-4 font-semibold">Maaş ödemeleri</h3>
        {d.salaryPayments.length === 0 ? (
          <p className="text-sm text-slate-500">Bu çalışan için kaydedilmiş maaş ödemesi yok.</p>
        ) : (
          <table className="grid-table">
            <thead><tr><th>Dönem</th><th>Ödeme tarihi</th><th className="text-right">Tutar</th><th>Durum</th></tr></thead>
            <tbody>
              {d.salaryPayments.map((p) => (
                <tr key={p.id}>
                  <td>{p.salaryPeriod ? formatPeriod(p.salaryPeriod) : ''}</td>
                  <td>{formatDate(p.date)}</td>
                  <td className="text-right tabular-nums">{money(p.amountKurus)}</td>
                  <td>{p.isPaid ? 'Ödendi' : 'Ödenmedi'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 className="mb-1 mt-4 font-semibold">Son mesailer</h3>
        {d.recentOvertime.length === 0 ? (
          <p className="text-sm text-slate-500">Bu çalışan için mesai kaydı yok.</p>
        ) : (
          <table className="grid-table">
            <thead><tr><th>Tarih</th><th>Saat</th><th className="text-right">Süre</th><th className="text-right">Ücret</th><th className="text-right">Tutar</th></tr></thead>
            <tbody>
              {d.recentOvertime.map((o) => (
                <tr key={o.id}>
                  <td>{formatDate(o.date)}</td>
                  <td>{o.startTime} – {o.endTime}</td>
                  <td className="text-right">{formatMinutes(o.workedMinutes)}</td>
                  <td className="text-right tabular-nums">{money(o.hourlyRateKurus)}</td>
                  <td className="text-right tabular-nums">{money(o.totalKurus)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
      {payOpen && (
        <SalaryPaymentForm employees={employees} employeeId={e.id} onClose={() => setPayOpen(false)}
          onSaved={() => { void load(); onChanged(); }} />
      )}
    </>
  );
}

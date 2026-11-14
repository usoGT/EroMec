import { useEffect, useState, type ReactNode } from 'react';
import { moneyToInput, parseMoney } from '../../shared/money';

export function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">
        {label} {required && <span className="text-red-600">*</span>}
      </span>
      {children}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : hint ? <span className="mt-1 block text-xs text-slate-500">{hint}</span> : null}
    </label>
  );
}

/**
 * Para girişi. Kullanıcı "1.250,50" gibi Türkçe biçimde yazabilir.
 * Değer dışarıya kuruş (tam sayı) olarak verilir; geçersizse null.
 */
export function MoneyInput({ value, onChange, invalid, autoFocus, placeholder = '0,00', name }: {
  value: number | null; onChange: (kurus: number | null, raw: string) => void; invalid?: boolean; autoFocus?: boolean; placeholder?: string; name?: string;
}) {
  const [text, setText] = useState(value === null ? '' : moneyToInput(value));
  useEffect(() => {
    // Dışarıdan gelen değer değiştiyse (ör. çalışan seçimi) kutuyu güncelle
    if (parseMoney(text) !== value) setText(value === null ? '' : moneyToInput(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <input
      name={name}
      className={`input text-right ${invalid ? 'input-error' : ''}`}
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => {
        setText(e.target.value);
        onChange(parseMoney(e.target.value), e.target.value);
      }}
      onBlur={() => {
        const k = parseMoney(text);
        if (k !== null) setText(moneyToInput(k));
      }}
    />
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{message}</div>;
}

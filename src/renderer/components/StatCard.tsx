import type { ReactNode } from 'react';

export default function StatCard({ label, value, hint, icon, tone = 'default' }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: 'default' | 'warn' }) {
  return (
    <div className="card border-t-2 border-t-red-600 px-4 py-3">
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{label}</span>
        {icon && <span className={tone === 'warn' ? 'text-amber-600' : 'text-brand-500'}>{icon}</span>}
      </div>
      <div className={`mt-1 whitespace-nowrap text-xl font-semibold tabular-nums ${tone === 'warn' ? 'text-amber-700' : 'text-slate-900'}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

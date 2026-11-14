export const statusLabel = (s: string) => (s === 'active' ? 'Aktif' : 'Ayrıldı');

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${status === 'active' ? 'bg-green-100 text-green-800' : 'bg-slate-200 text-slate-600'}`}>
      {statusLabel(status)}
    </span>
  );
}

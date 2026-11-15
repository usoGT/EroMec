// Puanto logosu: siyah kutu içinde kırmızı "P" ve beyaz onay işareti. İkonlar aynı çizimden üretilir (scripts/logo.mjs).
export default function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Puanto logosu">
      <rect x="1" y="1" width="62" height="62" rx="13" fill="#0a0a0a" stroke="#c62828" strokeWidth="2" />
      <rect x="15" y="12" width="9" height="40" rx="1.5" fill="#c62828" />
      <path d="M15 12 H32 A12 12 0 0 1 32 36 H15 V28 H32 A4 4 0 0 0 32 20 H15 Z" fill="#c62828" />
      <path d="M33 45 L39 51 L52 36" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Yazı logosu: "Puan" beyaz/siyah + "to" kırmızı */
export function Wordmark({ className = '', dark = true }: { className?: string; dark?: boolean }) {
  return (
    <span className={`font-extrabold tracking-tight ${className}`}>
      <span className={dark ? 'text-white' : 'text-neutral-900'}>Puan</span>
      <span className="text-red-600">to</span>
    </span>
  );
}

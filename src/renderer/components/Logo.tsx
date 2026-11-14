// EroMec logosu: siyah zemin üzerinde kırmızı "E" ve beyaz somun (mekanik). Uygulama simgesiyle aynı çizim (scripts/make-icon.py).
export default function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="EroMec logosu">
      <rect x="1" y="1" width="62" height="62" rx="13" fill="#0a0a0a" stroke="#a83232" strokeWidth="2" />
      <g fill="#a83232">
        <rect x="14" y="13" width="9" height="38" rx="1.5" />
        <rect x="14" y="13" width="33" height="8" rx="1.5" />
        <rect x="14" y="28" width="22" height="8" rx="1.5" />
        <rect x="14" y="43" width="33" height="8" rx="1.5" />
      </g>
      <polygon points="50,25.5 55.6,28.75 55.6,35.25 50,38.5 44.4,35.25 44.4,28.75" fill="#ffffff" />
      <circle cx="50" cy="32" r="2.6" fill="#0a0a0a" />
    </svg>
  );
}

/** Yazı logosu: "Ero" beyaz/siyah + "Mec" kırmızı */
export function Wordmark({ className = '', dark = true }: { className?: string; dark?: boolean }) {
  return (
    <span className={`font-extrabold tracking-tight ${className}`}>
      <span className={dark ? 'text-white' : 'text-neutral-900'}>Ero</span>
      <span className="text-red-600">Mec</span>
    </span>
  );
}

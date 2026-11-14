import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

// Üst üste açılan pencerelerde Esc tuşu yalnızca en üstteki pencereyi kapatır.
const stack: symbol[] = [];

export default function Modal({ title, onClose, children, footer, width = 'w-[560px]' }: Props) {
  useEffect(() => {
    const me = Symbol(title);
    stack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && stack[stack.length - 1] === me) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
    };
  }, [onClose, title]);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label={title}>
      {/* Telefonda pencere bütün ekranı kaplar */}
      <div className={`${width} flex max-h-[90vh] max-w-full flex-col rounded-md bg-surface text-left text-[14px] font-normal leading-normal text-slate-900 shadow-xl max-md:text-[15px] max-md:h-full max-md:max-h-full max-md:w-full max-md:rounded-none`}>
        <div className="safe-top shrink-0 rounded-t-md border-b-2 border-red-600 bg-neutral-900 text-white max-md:rounded-none">
        <div className="flex items-center justify-between px-5 py-3 max-md:px-4">
          <h2 className="min-w-0 truncate text-base font-semibold">{title}</h2>
          <button className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Kapat">
            <X size={18} />
          </button>
        </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 max-md:px-4">{children}</div>
        {footer && <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-slate-50 px-5 py-3 max-md:px-4 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

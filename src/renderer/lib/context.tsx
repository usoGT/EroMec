import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppSettings, ThemeMode } from '../../shared/types';
import { CURRENCY_SYMBOLS, formatMoney } from '../../shared/money';
import { api, errorMessage } from './api';

type ToastKind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: ToastKind; text: string }
interface ConfirmOptions { title: string; message: ReactNode; confirmText?: string; cancelText?: string; danger?: boolean }

interface AppContextValue {
  settings: AppSettings;
  reloadSettings: () => Promise<void>;
  money: (kurus: number) => string;
  /** Gece modu şu an etkin mi */
  isDark: boolean;
  /** Görünümü değiştirir ve kaydeder */
  setTheme: (theme: ThemeMode) => Promise<void>;
  symbol: string;
  toast: (text: string, kind?: ToastKind) => void;
  confirm: (o: ConfirmOptions) => Promise<boolean>;
  /** Hata mesajını kullanıcıya gösterir. */
  showError: (err: unknown) => void;
}

const Ctx = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('AppProvider eksik');
  return v;
}

/** Seçilen görünüme göre <html> etiketine "dark" sınıfını ekler; "system" seçiliyse Windows ayarını izler. */
function useDarkMode(theme: ThemeMode): boolean {
  const query = '(prefers-color-scheme: dark)';
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const dark = theme === 'dark' || (theme === 'system' && systemDark);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  return dark;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>({ companyName: 'Eroğlu Mechanic', appName: 'EroMec', currency: 'TRY', theme: 'light', dailyMinWageKurus: 0 });
  const isDark = useDarkMode(settings.theme);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const toast = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-2), { id, kind, text }]); // en fazla 3 bildirim
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 6000 : 3000);
  }, []);
  const showError = useCallback((err: unknown) => toast(errorMessage(err), 'error'), [toast]);

  const reloadSettings = useCallback(async () => {
    try {
      const s = await api.settingsGet();
      setSettings(s);
      document.title = `${s.appName} - ${s.companyName}`;
    } catch (e) {
      showError(e);
    }
  }, [showError]);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  const setTheme = useCallback(
    async (theme: ThemeMode) => {
      try {
        setSettings(await api.settingsSave({ ...settings, theme }));
      } catch (e) {
        showError(e);
      }
    },
    [settings, showError],
  );

  const confirm = useCallback(
    (o: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...o, resolve })),
    [],
  );
  const symbol = CURRENCY_SYMBOLS[settings.currency] ?? '₺';
  const money = useCallback((k: number) => formatMoney(k, symbol), [symbol]);

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <Ctx.Provider value={{ settings, reloadSettings, money, symbol, isDark, setTheme, toast, confirm, showError }}>
      {children}
      {confirmState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-label={confirmState.title}>
          <div className="mx-4 w-[440px] max-w-full rounded-md bg-surface shadow-xl">
            <div className="rounded-t-md border-b-2 border-red-600 bg-neutral-900 px-5 py-3 text-base font-semibold text-white">{confirmState.title}</div>
            <div className="px-5 py-4 text-sm text-slate-700">{confirmState.message}</div>
            <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3">
              <button className="btn-secondary" onClick={() => close(false)} autoFocus>
                {confirmState.cancelText ?? 'Vazgeç'}
              </button>
              <button className={confirmState.danger ? 'btn-danger' : 'btn-primary'} onClick={() => close(true)}>
                {confirmState.confirmText ?? 'Tamam'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="fixed bottom-4 right-4 z-[60] flex w-96 flex-col gap-2 max-md:inset-x-3 max-md:bottom-[calc(72px+env(safe-area-inset-bottom))] max-md:w-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`rounded border-l-4 bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg ${
              t.kind === 'error' ? 'border-red-500' : t.kind === 'info' ? 'border-neutral-400' : 'border-green-500'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

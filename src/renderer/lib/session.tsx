// Çevrimiçi oturum: giriş yapılmadan uygulama açılmaz; girişten sonra veriler sunucudan indirilir.
// Sunucu yapılandırılmamışsa (masaüstü sürümü, .env.web yok) bu katman hiçbir şey yapmaz.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { LogIn, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import type { Me } from '../../web/engine';
import { SERVER_CONFIGURED, useAuth } from './auth';
import { useApp } from './context';
import { errorMessage } from './api';
import Logo, { Wordmark } from '../components/Logo';
import AccountModal from '../components/AccountModal';

interface SessionValue {
  /** Çevrimiçi sürümde giriş yapan kullanıcının rolü ve şantiyeleri; yerel sürümde null */
  me: Me | null;
  /** Ana firma yöneticisi mi (yerel sürümde herkes yöneticidir) */
  isAdmin: boolean;
  /** Sunucudaki güncel veriyi indirir ve sayfaları yeniler */
  refresh: () => Promise<void>;
  refreshing: boolean;
}

const Ctx = createContext<SessionValue>({ me: null, isAdmin: true, refresh: async () => undefined, refreshing: false });
export const useSession = () => useContext(Ctx);

/** Uygulama arka plandan öne gelince veri bu kadar eskiyse kendiliğinden yenilenir */
const AUTO_REFRESH_MS = 60_000;

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="safe-top safe-bottom flex h-full flex-col items-center justify-center gap-4 bg-[#0d0d0d] px-6 text-center text-white">
      <Logo size={72} />
      <div className="text-3xl"><Wordmark /></div>
      {children}
    </div>
  );
}

export function SessionGate({ children }: { children: ReactNode }) {
  const online = SERVER_CONFIGURED && window.eromecSync?.online === true;
  const { account, loading, signOut } = useAuth();
  const { reloadSettings, showError } = useApp();
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<'login' | 'register' | null>(null);
  const lastPull = useRef(0);
  const accountId = account?.id ?? null;

  const connect = useCallback(async () => {
    setState('loading');
    try {
      setMe(await window.eromecSync!.connect());
      lastPull.current = Date.now();
      await reloadSettings();
      setVersion((v) => v + 1);
      setState('ready');
    } catch (e) {
      setError(errorMessage(e));
      setState('error');
    }
  }, [reloadSettings]);

  useEffect(() => {
    if (!online) return;
    if (!accountId) {
      setState('idle');
      setMe(null);
      void window.eromecSync!.disconnect().then(reloadSettings);
      return;
    }
    setForm(null);
    void connect();
  }, [online, accountId, connect, reloadSettings]);

  const refresh = useCallback(async () => {
    if (!online || !accountId) return;
    setRefreshing(true);
    try {
      setMe(await window.eromecSync!.refresh());
      lastPull.current = Date.now();
      await reloadSettings();
      setVersion((v) => v + 1);
    } catch (e) {
      showError(e);
    } finally {
      setRefreshing(false);
    }
  }, [online, accountId, reloadSettings, showError]);

  // Uygulama öne gelince (başka uygulamadan dönünce) veriyi tazele; açık bir pencere/form varken dokunma.
  useEffect(() => {
    if (!online || state !== 'ready') return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastPull.current < AUTO_REFRESH_MS) return;
      if (document.querySelector('[role="dialog"]')) return;
      void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [online, state, refresh]);

  if (!online) return <>{children}</>;

  if (loading) return <Splash><p className="text-white/60">Açılıyor…</p></Splash>;

  if (!account) {
    return (
      <Splash>
        <p className="max-w-xs text-white/70">Personel, puantaj ve gider takibi. Devam etmek için hesabınıza giriş yapın.</p>
        <div className="mt-2 flex w-full max-w-xs flex-col gap-2">
          <button className="btn-primary justify-center !py-3 text-base" data-testid="gate-login" onClick={() => setForm('login')}><LogIn size={18} /> Giriş yap</button>
          <button className="btn justify-center border-white/30 !py-3 text-base text-white hover:bg-white/10" data-testid="gate-register" onClick={() => setForm('register')}><UserPlus size={18} /> Kayıt ol</button>
        </div>
        {form && <AccountModal initialTab={form} onClose={() => setForm(null)} />}
      </Splash>
    );
  }

  if (state === 'error') {
    return (
      <Splash>
        <p className="max-w-sm rounded border border-red-500/60 bg-red-900/30 px-4 py-3 text-sm" role="alert">Veriler yüklenemedi: {error}</p>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => void connect()}><RefreshCw size={16} /> Tekrar dene</button>
          <button className="btn border-white/30 text-white hover:bg-white/10" onClick={() => void signOut().catch(showError)}><LogOut size={16} /> Çıkış yap</button>
        </div>
      </Splash>
    );
  }

  if (state !== 'ready' || !me) return <Splash><p className="text-white/60" data-testid="gate-loading">Veriler yükleniyor…</p></Splash>;

  return (
    <Ctx.Provider value={{ me, isAdmin: me.role === 'admin', refresh, refreshing }}>
      {/* Veri yenilenince sayfalar baştan kurulur ki listeler güncel veriyi çeksin */}
      <div key={version} className="h-full">{children}</div>
    </Ctx.Provider>
  );
}

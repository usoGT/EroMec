// Çevrimiçi oturum: giriş yapılmadan uygulama açılmaz; girişten sonra veriler sunucudan indirilir.
// Sunucu yapılandırılmamışsa (masaüstü sürümü, .env.web yok) bu katman hiçbir şey yapmaz.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CloudOff, HardDrive, LogIn, LogOut, RefreshCw, UserPlus } from 'lucide-react';
import type { Me } from '../../web/engine';
import { SERVER_CONFIGURED, useAuth } from './auth';
import { useApp } from './context';
import { errorMessage } from './api';
import Logo, { Wordmark } from '../components/Logo';
import AccountModal from '../components/AccountModal';
import NewPasswordModal from '../components/NewPasswordModal';
import WorkspaceSetup from '../components/WorkspaceSetup';

interface SessionValue {
  /** Çevrimiçi sürümde giriş yapan kullanıcının rolü ve şantiyeleri; yerel sürümde null */
  me: Me | null;
  /** Ana firma yöneticisi mi (yerel sürümde herkes yöneticidir) */
  isAdmin: boolean;
  /** Sunucudaki güncel veriyi indirir ve sayfaları yeniler */
  refresh: () => Promise<void>;
  refreshing: boolean;
  /** İnternet yokken son kopya salt okunur açık */
  readOnly: boolean;
}

const Ctx = createContext<SessionValue>({ me: null, isAdmin: true, refresh: async () => undefined, refreshing: false, readOnly: false });
export const useSession = () => useContext(Ctx);

/** Uygulama arka plandan öne gelince veri bu kadar eskiyse kendiliğinden yenilenir */
const AUTO_REFRESH_MS = 60_000;

const isNetworkError = (msg: string) => /ulaşılamadı|failed to fetch|network/i.test(msg) || (typeof navigator !== 'undefined' && navigator.onLine === false);
const formatStamp = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return Number.isNaN(d.getTime()) ? iso : `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

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
  const { account, loading, signOut, recovering } = useAuth();
  const { reloadSettings, showError, toast } = useApp();
  const [me, setMe] = useState<Me | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<'login' | 'register' | null>(null);
  /** Salt okunur açılan son kopyanın tarihi; null ise çevrimiçi */
  const [copyAt, setCopyAt] = useState<string | null>(null);
  /** Hata ekranında: bu cihazda açılabilecek son kopyanın tarihi */
  const [copyAvailable, setCopyAvailable] = useState<string | null>(null);
  const lastPull = useRef(0);
  const accountId = account?.id ?? null;

  const openCopy = useCallback(async (id: string) => {
    const sync = window.eromecSync!;
    const info = await sync.copyInfo(id);
    if (!info) return false;
    setMe(await sync.openCopy(id));
    setCopyAt(info.savedAt);
    await reloadSettings();
    setVersion((v) => v + 1);
    setState('ready');
    return true;
  }, [reloadSettings]);

  const connect = useCallback(async (quiet = false) => {
    if (!quiet) setState('loading');
    try {
      setMe(await window.eromecSync!.connect());
      setCopyAt(null);
      lastPull.current = Date.now();
      await reloadSettings();
      setVersion((v) => v + 1);
      setState('ready');
    } catch (e) {
      const msg = errorMessage(e);
      if (quiet) throw e;
      // İnternet yoksa bu cihazdaki son kopya salt okunur açılır.
      if (accountId && isNetworkError(msg) && (await openCopy(accountId).catch(() => false))) return;
      setError(msg);
      setCopyAvailable(accountId ? (await window.eromecSync!.copyInfo(accountId).catch(() => null))?.savedAt ?? null : null);
      setState('error');
    }
  }, [reloadSettings, accountId, openCopy]);

  useEffect(() => {
    // Oturum henüz okunmadıysa bekle: aksi hâlde açılışta "giriş yok" sanılıp cihazdaki son kopya silinir.
    if (!online || loading) return;
    if (!accountId) {
      setState('idle');
      setMe(null);
      void window.eromecSync!.disconnect().then(reloadSettings);
      return;
    }
    setForm(null);
    void connect();
  }, [online, loading, accountId, connect, reloadSettings]);

  const refresh = useCallback(async () => {
    if (!online || !accountId) return;
    setRefreshing(true);
    try {
      if (copyAt) {
        await connect(true); // salt okunur kopyadan çevrimiçine dön
        toast('Bağlantı kuruldu; veriler güncel.');
        return;
      }
      setMe(await window.eromecSync!.refresh());
      lastPull.current = Date.now();
      await reloadSettings();
      setVersion((v) => v + 1);
    } catch (e) {
      showError(e);
    } finally {
      setRefreshing(false);
    }
  }, [online, accountId, reloadSettings, showError, copyAt, connect, toast]);

  /** Sessiz yenileme (anlık bildirim, uygulamaya dönüş): yalnızca veri gerçekten değiştiyse sayfalar yeniden kurulur. */
  const quietSync = useCallback(async () => {
    if (!online || !accountId || copyAt) return;
    try {
      const m = await window.eromecSync!.refresh();
      lastPull.current = Date.now();
      setMe(m);
      if (window.eromecSync!.lastRefreshChanged) {
        await reloadSettings();
        setVersion((v) => v + 1);
      }
    } catch (e) {
      console.warn('[Puanto] arka plan yenileme:', e);
    }
  }, [online, accountId, copyAt, reloadSettings]);

  // Anlık güncelleme: başka cihazdaki değişiklik gelince kısa bir beklemeden sonra (form açık değilse) çekilir.
  useEffect(() => {
    if (!online || state !== 'ready' || copyAt) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let off: (() => void) | null = null;
    let closed = false;
    const run = () => {
      timer = null;
      if (document.querySelector('[role="dialog"]') || document.visibilityState !== 'visible') {
        timer = setTimeout(run, 4000); // form kapanınca / uygulamaya dönünce
        return;
      }
      void quietSync();
    };
    void window.eromecSync!.onRemoteChange(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, 1500);
    }).then((unsub) => (closed ? unsub() : (off = unsub))).catch((e) => console.warn('[Puanto] anlık güncelleme kurulamadı:', e));
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      off?.();
    };
  }, [online, state, copyAt, quietSync]);

  // Uygulama öne gelince (başka uygulamadan dönünce) veriyi tazele; açık bir pencere/form varken dokunma.
  useEffect(() => {
    if (!online || state !== 'ready') return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastPull.current < AUTO_REFRESH_MS) return;
      if (document.querySelector('[role="dialog"]')) return;
      void (copyAt ? refresh() : quietSync());
    };
    document.addEventListener('visibilitychange', onVisible);
    // Salt okunur kopyadayken internet gelince kendiliğinden bağlan
    const onOnline = () => {
      if (copyAt && !document.querySelector('[role="dialog"]')) void connect(true).catch(() => undefined);
    };
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [online, state, refresh, copyAt, connect, quietSync]);

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
        <div className="flex flex-wrap justify-center gap-2">
          <button className="btn-primary" onClick={() => void connect()}><RefreshCw size={16} /> Tekrar dene</button>
          {copyAvailable && accountId && (
            <button className="btn border-white/30 text-white hover:bg-white/10" data-testid="open-copy" onClick={() => void openCopy(accountId).catch(showError)}>
              <HardDrive size={16} /> Son kopyayı aç ({formatStamp(copyAvailable)})
            </button>
          )}
          <button className="btn border-white/30 text-white hover:bg-white/10" onClick={() => void signOut().catch(showError)}><LogOut size={16} /> Çıkış yap</button>
        </div>
      </Splash>
    );
  }

  if (state !== 'ready' || !me) return <Splash><p className="text-white/60" data-testid="gate-loading">Veriler yükleniyor…</p></Splash>;

  // workspaceId undefined ise sunucuda isletme.sql henüz yok: eski tek işletmeli düzen
  if (!copyAt && me.workspaceId === null) {
    return (
      <Splash>
        <WorkspaceSetup email={me.email} onReady={() => connect(true)} onSignOut={() => void signOut().catch(showError)} />
      </Splash>
    );
  }

  return (
    <Ctx.Provider value={{ me, isAdmin: me.workspaceRole === 'owner' || me.role === 'admin', refresh, refreshing, readOnly: copyAt !== null }}>
      <div className="flex h-full flex-col">
        {copyAt && (
          <div className="safe-top flex shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-500 px-3 py-1.5 text-center text-sm font-medium text-black" role="status" data-testid="readonly-banner">
            <span className="flex items-center gap-1.5"><CloudOff size={16} /> İnternet yok: {formatStamp(copyAt)} tarihli son kopya salt okunur açık.</span>
            <button className="rounded bg-black/80 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-60" disabled={refreshing} onClick={() => void refresh().catch(showError)}>
              {refreshing ? 'Bağlanıyor…' : 'Tekrar bağlan'}
            </button>
          </div>
        )}
        {/* Veri yenilenince sayfalar baştan kurulur ki listeler güncel veriyi çeksin */}
        <div key={version} className="min-h-0 flex-1">{children}</div>
      </div>
      {recovering && <NewPasswordModal />}
    </Ctx.Provider>
  );
}

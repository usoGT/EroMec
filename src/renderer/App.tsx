import { useState } from 'react';
import { Banknote, BarChart3, CalendarDays, ClipboardCheck, Clock, CircleUserRound, HardHat, Home, LayoutGrid, Menu, Receipt, Settings as SettingsIcon, Users } from 'lucide-react';
import { AppProvider, useApp } from './lib/context';
import Logo, { Wordmark } from './components/Logo';
import { useIsMobile } from './lib/useIsMobile';
import { ACCOUNTS_ENABLED, AuthProvider, useAuth } from './lib/auth';
import AccountModal from './components/AccountModal';
import DashboardPage from './pages/DashboardPage';
import EmployeesPage from './pages/EmployeesPage';
import OvertimePage from './pages/OvertimePage';
import ExpensesPage from './pages/ExpensesPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import CalendarPage from './pages/CalendarPage';
import SitesPage from './pages/SitesPage';
import AttendancePage from './pages/AttendancePage';
import PayrollPage from './pages/PayrollPage';

export type PageId = 'dashboard' | 'calendar' | 'attendance' | 'payroll' | 'employees' | 'overtime' | 'expenses' | 'sites' | 'reports' | 'settings';

const MENU: { id: PageId; label: string; icon: typeof Home }[] = [
  { id: 'dashboard', label: 'Ana Sayfa', icon: Home },
  { id: 'calendar', label: 'Takvim', icon: CalendarDays },
  { id: 'attendance', label: 'Puantaj', icon: ClipboardCheck },
  { id: 'payroll', label: 'Bordro', icon: Banknote },
  { id: 'employees', label: 'Çalışanlar', icon: Users },
  { id: 'overtime', label: 'Mesailer', icon: Clock },
  { id: 'expenses', label: 'Giderler', icon: Receipt },
  { id: 'sites', label: 'Şantiyeler', icon: HardHat },
  { id: 'reports', label: 'Raporlar', icon: BarChart3 },
  { id: 'settings', label: 'Ayarlar', icon: SettingsIcon },
];

const MENU_KEY = 'eromec.menuOpen';

function readMenuOpen(): boolean {
  try {
    return localStorage.getItem(MENU_KEY) === '1';
  } catch {
    return false;
  }
}

/** Hesap düğmesi: giriş yapılmamışsa "Giriş yap", yapılmışsa kullanıcının baş harfi. Yalnızca tarayıcı/telefon sürümünde. */
function AccountButton({ wide = true }: { wide?: boolean }) {
  const { account } = useAuth();
  const [open, setOpen] = useState(false);
  if (!ACCOUNTS_ENABLED) return null;
  const initial = account ? (account.fullName || account.email).charAt(0).toLocaleUpperCase('tr-TR') : '';
  return (
    <>
      <button onClick={() => setOpen(true)} data-testid="account-button" aria-label={account ? 'Hesabım' : 'Giriş yap veya kayıt ol'} title={account ? account.email : 'Giriş yap / Kayıt ol'}
        className={account
          ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white'
          : 'flex shrink-0 items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-[13px] font-medium text-white active:bg-white/10 hover:bg-white/10'}>
        {account ? initial : <><CircleUserRound size={17} />{wide && 'Giriş yap'}</>}
      </button>
      {open && <AccountModal onClose={() => setOpen(false)} />}
    </>
  );
}

function Pages({ page, setPage }: { page: PageId; setPage: (p: PageId) => void }) {
  return (
    <>
      {page === 'dashboard' && <DashboardPage onNavigate={setPage} />}
      {page === 'calendar' && <CalendarPage />}
      {page === 'attendance' && <AttendancePage />}
      {page === 'payroll' && <PayrollPage />}
      {page === 'employees' && <EmployeesPage />}
      {page === 'overtime' && <OvertimePage />}
      {page === 'expenses' && <ExpensesPage />}
      {page === 'sites' && <SitesPage />}
      {page === 'reports' && <ReportsPage onNavigate={setPage} />}
      {page === 'settings' && <SettingsPage />}
    </>
  );
}

function Shell() {
  const [page, setPage] = useState<PageId>('dashboard');
  const mobile = useIsMobile();
  return mobile ? <MobileShell page={page} setPage={setPage} /> : <DesktopShell page={page} setPage={setPage} />;
}

// Telefonda alt çubukta duran dört ana bölüm; kalanlar "Diğer" sayfasından açılır.
const TABS: PageId[] = ['dashboard', 'attendance', 'overtime', 'expenses'];

function MobileShell({ page, setPage }: { page: PageId; setPage: (p: PageId) => void }) {
  const [more, setMore] = useState(false);
  const { settings } = useApp();
  const go = (id: PageId) => {
    setPage(id);
    setMore(false);
  };
  const inMore = !TABS.includes(page);
  const tabCls = (active: boolean) =>
    `relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] ${active ? 'font-semibold text-white' : 'text-white/60'}`;
  const bar = (active: boolean) => active && <span className="absolute inset-x-5 top-0 h-[3px] rounded-b bg-red-500" />;
  return (
    <div className="flex h-full flex-col">
      <header className="safe-top shrink-0 border-b-2 border-red-700 bg-[#0d0d0d] text-white">
        <div className="flex items-center gap-2 px-3 py-2">
          <Logo size={30} />
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-[17px]" data-testid="app-name">
              {settings.appName === 'EroMec' ? <Wordmark /> : <span className="font-bold">{settings.appName}</span>}
            </div>
            <div className="truncate text-[11px] text-white/60">{settings.companyName}</div>
          </div>
          <AccountButton />
        </div>
      </header>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-3 pb-6 pt-3">
        <Pages page={page} setPage={setPage} />
      </main>
      {more && (
        <div className="fixed inset-0 z-30 flex flex-col justify-end bg-black/50" onClick={() => setMore(false)}>
          <div className="mb-[calc(58px+env(safe-area-inset-bottom))] rounded-t-2xl border-t-2 border-red-700 bg-[#141414] p-3 text-white" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Diğer bölümler">
            <div className="mx-auto mb-3 h-1 w-10 rounded bg-white/25" />
            <div className="grid grid-cols-3 gap-2">
              {MENU.filter((m) => !TABS.includes(m.id)).map((m) => {
                const Icon = m.icon;
                const active = page === m.id;
                return (
                  <button key={m.id} onClick={() => go(m.id)} aria-current={active ? 'page' : undefined}
                    className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3.5 text-[13px] ${active ? 'bg-red-700 font-semibold' : 'bg-white/5 text-white/85 active:bg-white/10'}`}>
                    <Icon size={22} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      <nav className="safe-bottom z-30 flex shrink-0 border-t-2 border-red-700 bg-[#0d0d0d]" aria-label="Ana menü">
        {MENU.filter((m) => TABS.includes(m.id)).map((m) => {
          const Icon = m.icon;
          const active = page === m.id && !more;
          return (
            <button key={m.id} onClick={() => go(m.id)} aria-current={active ? 'page' : undefined} className={tabCls(active)}>
              {bar(active)}
              <Icon size={21} />
              {m.label}
            </button>
          );
        })}
        <button onClick={() => setMore((v) => !v)} aria-expanded={more} className={tabCls(more || inMore)}>
          {bar(more || inMore)}
          <LayoutGrid size={21} />
          Diğer
        </button>
      </nav>
    </div>
  );
}

function DesktopShell({ page, setPage }: { page: PageId; setPage: (p: PageId) => void }) {
  // Sol menü varsayılan olarak kapalı (yalnızca simgeler); ☰ ile açılır, tercih hatırlanır.
  const [open, setOpen] = useState(readMenuOpen);
  const { settings } = useApp();
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(MENU_KEY, o ? '0' : '1');
      } catch {
        /* tarayıcı depolaması kullanılamıyorsa yalnızca bu oturumda geçerli */
      }
      return !o;
    });
  };
  const hide = open ? '' : 'sr-only';
  return (
    <div className="flex h-full">
      <aside className={`flex shrink-0 flex-col border-r-4 border-red-700 bg-[#0d0d0d] text-white transition-[width] duration-150 ${open ? 'w-56' : 'w-16'}`} data-open={open}>
        <div className={`flex items-center gap-2 border-b border-white/10 py-3 ${open ? 'px-3' : 'flex-col px-2'}`}>
          <button onClick={toggle} className="rounded p-1.5 text-white/80 hover:bg-white/10 hover:text-white" aria-label={open ? 'Menüyü kapat' : 'Menüyü aç'} title={open ? 'Menüyü kapat' : 'Menüyü aç'} aria-expanded={open}>
            <Menu size={22} />
          </button>
          <Logo size={open ? 36 : 32} />
          <div className={`min-w-0 ${hide}`}>
            <div className="truncate text-lg leading-tight" data-testid="app-name">
              {settings.appName === 'EroMec' ? <Wordmark /> : <span className="font-bold">{settings.appName}</span>}
            </div>
            <div className="truncate text-xs text-white/70">{settings.companyName}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2" aria-label="Ana menü">
          {MENU.map((m) => {
            const Icon = m.icon;
            const active = page === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setPage(m.id)}
                aria-current={active ? 'page' : undefined}
                aria-label={m.label}
                title={open ? undefined : m.label}
                className={`flex w-full items-center gap-3 py-2.5 text-left text-[15px] ${open ? 'px-4' : 'justify-center px-0'} ${
                  active ? 'border-l-4 border-red-600 bg-white/10 font-semibold text-white' : 'border-l-4 border-transparent text-white/75 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon size={open ? 18 : 20} />
                <span className={hide}>{m.label}</span>
              </button>
            );
          })}
        </nav>
        <div className={`border-t border-white/10 py-3 ${open ? 'px-3' : 'px-2'}`}>
          <AccountButton wide={open} />
          {open && !ACCOUNTS_ENABLED && <div className="px-2 text-xs text-white/50">Veriler bu bilgisayarda saklanır.</div>}
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto p-6">
        <Pages page={page} setPage={setPage} />
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </AppProvider>
  );
}

// İşletmesi olmayan kullanıcı: kendi işletmesini açar ya da bir işletme sahibinin onu eklemesini bekler.
import { useEffect, useState } from 'react';
import { Building2, LogOut, RefreshCw } from 'lucide-react';
import { errorMessage } from '../lib/api';

export default function WorkspaceSetup({ email, onReady, onSignOut }: { email: string; onReady: () => Promise<void>; onSignOut: () => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bir işletme sahibi bu kişiyi eklerse kendiliğinden devam edilir.
  useEffect(() => {
    const t = setInterval(() => void onReady().catch(() => undefined), 15_000);
    return () => clearInterval(t);
  }, [onReady]);

  const create = async () => {
    if (name.trim().length < 2) return setError('İşletmenin (firmanın) adını yazın.');
    setBusy(true);
    setError(null);
    try {
      await window.eromecSync!.workspaceCreate(name.trim());
      await onReady();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-sm text-left" data-testid="workspace-setup">
      <h2 className="mb-1 text-center text-lg font-semibold">İşletmeni kur</h2>
      <p className="mb-4 text-center text-sm text-white/70">Personel, puantaj ve giderler işletmene ait olur; başka işletmeler göremez.</p>
      {error && <p className="mb-3 rounded border border-red-500/60 bg-red-900/30 px-3 py-2 text-sm" role="alert">{error}</p>}
      <form className="grid gap-2" onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label className="text-sm font-medium" htmlFor="ws-name">İşletmenin adı</label>
        <input id="ws-name" className="input !bg-white !text-black" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} placeholder="Örn. Yılmaz İnşaat" autoFocus />
        <button type="submit" className="btn-primary justify-center !py-2.5" disabled={busy} data-testid="workspace-create"><Building2 size={17} /> {busy ? 'Kuruluyor…' : 'İşletmeyi aç'}</button>
      </form>
      <div className="mt-6 rounded border border-white/15 px-3 py-3 text-sm text-white/75">
        <b className="text-white">Bir işletmede mi çalışıyorsun?</b> İşletme sahibinden seni şu e-postayla eklemesini iste:
        <div className="mt-1 break-all font-mono text-white">{email}</div>
        Eklendiğinde bu ekran kendiliğinden açılır.
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <button className="btn border-white/30 text-white hover:bg-white/10" disabled={busy} onClick={() => void onReady().catch((e) => setError(errorMessage(e)))}><RefreshCw size={15} /> Kontrol et</button>
        <button className="btn border-white/30 text-white hover:bg-white/10" onClick={onSignOut}><LogOut size={15} /> Çıkış yap</button>
      </div>
    </div>
  );
}

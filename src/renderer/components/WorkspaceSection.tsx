// Ayarlar → İşletme ve üyeler (çevrimiçi): sahip üye ekler/çıkarır, üye işletmeden ayrılabilir.
import { useCallback, useEffect, useState } from 'react';
import { Copy, LogOut, RefreshCw, Trash2, UserPlus } from 'lucide-react';
import type { WorkspaceMember } from '../../web/webApi';
import { errorMessage } from '../lib/api';
import { useApp } from '../lib/context';
import { useSession } from '../lib/session';
import { FormError } from './Fields';

export default function WorkspaceSection() {
  const { me, refresh, readOnly } = useSession();
  const { toast, confirm } = useApp();
  const sync = window.eromecSync!;
  const [members, setMembers] = useState<WorkspaceMember[] | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = me?.workspaceRole === 'owner';

  const [code, setCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMembers(await sync.workspaceMembers());
      if (me?.workspaceRole === 'owner') setCode(await sync.workspaceCode());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [sync, me?.workspaceRole]);
  useEffect(() => {
    if (!readOnly) void load();
  }, [load, readOnly]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const mail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return setError('Geçerli bir e-posta adresi girin.');
    void run(async () => {
      const r = await sync.workspaceAddMember(mail);
      setEmail('');
      toast(r.pending ? `${mail} henüz kayıtlı değil; kayıt olunca işletmene otomatik katılacak.` : `${mail} işletmene eklendi.`);
      await load();
    });
  };

  const copyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast('Firma kodu kopyalandı.');
    } catch {
      toast(`Firma kodu: ${code}`, 'info');
    }
  };

  const resetCode = () => void run(async () => {
    const ok = await confirm({
      title: 'Firma kodunu yenile',
      message: <>Eski kod (<b>{code}</b>) artık çalışmaz; firmaya henüz katılmamış kişilere yeni kodu vermen gerekir. Mevcut üyeler etkilenmez.</>,
      confirmText: 'Yenile',
    });
    if (!ok) return;
    setCode(await sync.workspaceResetCode());
    toast('Yeni firma kodu oluşturuldu.');
  });

  const remove = (m: WorkspaceMember) => void run(async () => {
    const self = m.userId === me?.id;
    const ok = await confirm({
      title: self ? 'İşletmeden ayrıl' : m.pending ? 'Daveti sil' : 'Üyeyi çıkar',
      message: self
        ? <>“<b>{me?.workspaceName}</b>” işletmesinden ayrılırsan bu işletmenin hiçbir kaydını göremezsin. Emin misin?</>
        : m.pending ? <><b>{m.email}</b> için bekleyen davet silinsin mi?</>
          : <><b>{m.fullName || m.email}</b> işletmenin hiçbir kaydını artık göremeyecek. Emin misin?</>,
      confirmText: self ? 'Ayrıl' : m.pending ? 'Sil' : 'Çıkar',
      danger: true,
    });
    if (!ok) return;
    await sync.workspaceRemoveMember(m.pending ? null : m.userId, m.email);
    if (self) {
      toast('İşletmeden ayrıldın.', 'info');
      await refresh();
      return;
    }
    toast(m.pending ? 'Davet silindi.' : `${m.fullName || m.email} işletmeden çıkarıldı.`, 'info');
    await load();
  });

  if (!me) return null;
  return (
    <section className="card mb-4 px-5 py-4" data-testid="workspace-section">
      <h2 className="mb-1 font-semibold">İşletme ve üyeler</h2>
      <p className="mb-3 text-sm text-slate-600">
        <b>{me.workspaceName ?? 'İşletmen'}</b> · {isOwner ? 'sahibisin' : 'üyesin'}. İşletmedeki kayıtları başka işletmeler göremez.
        {isOwner ? ' Sahip olarak bütün şantiyeleri görürsün; üyeler kendi açtıkları ve kendileriyle paylaşılan şantiyeleri görür.' : ''}
      </p>
      <FormError message={error} />
      {isOwner && !readOnly && code && (
        <div className="mb-4 rounded border border-slate-200 bg-slate-50 px-3 py-3" data-testid="workspace-code-box">
          <div className="text-sm text-slate-600">Firma kodu — şeflerin uygulamada <b>“Şef / çalışanım”</b> deyip bu kodu yazarak katılır:</div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded bg-white px-3 py-1.5 font-mono text-xl font-bold tracking-[0.3em] text-slate-900 ring-1 ring-slate-300" data-testid="workspace-code-value">{code}</span>
            <button className="btn-secondary" onClick={() => void copyCode()}><Copy size={15} /> Kopyala</button>
            <button className="btn-link" disabled={busy} onClick={resetCode}><RefreshCw size={14} /> Kodu yenile</button>
          </div>
        </div>
      )}
      {isOwner && !readOnly && (
        <form className="mb-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); add(); }} noValidate>
          <input name="memberEmail" type="email" inputMode="email" autoCapitalize="none" className="input min-w-0 flex-1" value={email}
            onChange={(e) => setEmail(e.target.value)} placeholder="ya da e-postayla ekle" aria-label="Eklenecek kişinin e-postası" data-testid="member-email" />
          <button type="submit" className="btn-primary" disabled={busy || !email.trim()}><UserPlus size={16} /> Üye ekle</button>
        </form>
      )}
      {readOnly ? <p className="text-sm text-slate-500">İnternet yokken üye listesi görüntülenemez.</p> : !members ? <p className="text-sm text-slate-500">Yükleniyor…</p> : (
        <ul className="divide-y divide-slate-100 rounded border border-slate-200">
          {members.map((m) => (
            <li key={m.userId ?? `davet-${m.email}`} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{m.pending ? m.email : m.fullName || '—'}{m.userId === me.id && <span className="ml-1 text-xs text-slate-500">(sen)</span>}</div>
                <div className="truncate text-sm text-slate-500">{m.pending ? 'Davet bekliyor (kayıt olunca katılır)' : m.email}</div>
              </div>
              {m.role === 'owner' && !m.pending ? <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">Sahip</span>
                : m.userId === me.id ? <button className="btn-link-danger" disabled={busy} onClick={() => remove(m)}><LogOut size={14} /> Ayrıl</button>
                : isOwner && <button className="btn-link-danger" disabled={busy} onClick={() => remove(m)}><Trash2 size={14} /> {m.pending ? 'Sil' : 'Çıkar'}</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ŞU AN KULLANILMIYOR: giriş yapan herkes yönetici sayılıyor (bkz. supabase/schema.sql, profiles.role).
// Şantiye bazlı yetki istenirse bu bölüm Ayarlar sayfasına yeniden eklenir.
// Ayarlar → Kullanıcılar (yalnızca ana firma yöneticisi, çevrimiçi sürüm):
// kayıt olan kişilerin rolünü ve hangi şantiyelere bakacağını belirler.
import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Site } from '../../shared/types';
import { api, errorMessage } from '../lib/api';
import { getSupabase } from '../lib/auth';
import { useApp } from '../lib/context';
import { useSession } from '../lib/session';
import { serverErrorMessage } from '../../web/sync';

interface Profile { id: string; email: string; full_name: string; role: 'admin' | 'chief' }

export default function UsersSection() {
  const { me } = useSession();
  const { toast, showError, confirm } = useApp();
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [members, setMembers] = useState<Map<string, Set<number>>>(new Map());
  const [sites, setSites] = useState<Site[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const sb = await getSupabase();
      const [p, m, s] = await Promise.all([
        sb.from('profiles').select('id, email, full_name, role').order('created_at'),
        sb.from('site_members').select('user_id, site_id'),
        api.sitesList(),
      ]);
      if (p.error) throw new Error(serverErrorMessage(p.error));
      if (m.error) throw new Error(serverErrorMessage(m.error));
      const map = new Map<string, Set<number>>();
      for (const r of m.data as { user_id: string; site_id: number }[]) map.set(r.user_id, (map.get(r.user_id) ?? new Set()).add(Number(r.site_id)));
      setUsers(p.data as Profile[]);
      setMembers(map);
      setSites(s);
    } catch (e) {
      showError(e);
    }
  }, [showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e) {
      showError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const setRole = (u: Profile, role: Profile['role']) => void run(async () => {
    if (role === 'admin' && !(await confirm({ title: 'Yönetici yap', message: <><b>{u.full_name || u.email}</b> bütün şantiyeleri, maaşları ve ayarları görüp değiştirebilecek. Emin misiniz?</>, confirmText: 'Yönetici yap' }))) return;
    const { error } = await (await getSupabase()).from('profiles').update({ role }).eq('id', u.id);
    if (error) throw new Error(serverErrorMessage(error));
    toast(`${u.full_name || u.email}: ${role === 'admin' ? 'yönetici' : 'şantiye şefi'} yapıldı.`);
  });

  const toggleSite = (u: Profile, siteId: number, on: boolean) => void run(async () => {
    const sb = await getSupabase();
    const { error } = on
      ? await sb.from('site_members').insert({ user_id: u.id, site_id: siteId })
      : await sb.from('site_members').delete().eq('user_id', u.id).eq('site_id', siteId);
    if (error) throw new Error(serverErrorMessage(error));
  });

  return (
    <section className="card mb-4 px-5 py-4" data-testid="users-section">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Kullanıcılar ve şantiye yetkileri</h2>
        <button className="btn-secondary" onClick={() => void load()} disabled={busy}><RefreshCw size={15} /> Yenile</button>
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Uygulamadan kayıt olan herkes burada görünür. Şantiye şefi yalnızca işaretlediğiniz şantiyelerin kayıtlarını (maaş, T.C., IBAN dahil) görür ve yönetir; yönetici her şeyi görür.
      </p>
      {!users ? <p className="text-sm text-slate-500">Yükleniyor…</p> : (
        <div className="space-y-2">
          {users.map((u) => {
            const own = members.get(u.id) ?? new Set<number>();
            const self = u.id === me?.id;
            return (
              <div key={u.id} className="rounded border border-slate-200 px-3 py-2.5" data-user={u.email}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{u.full_name || '—'}{self && <span className="ml-1 text-xs text-slate-500">(siz)</span>}</div>
                    <div className="truncate text-sm text-slate-500">{u.email}</div>
                  </div>
                  <select className="input w-44" aria-label="Rol" value={u.role} disabled={busy || self} title={self ? 'Kendi rolünüzü değiştiremezsiniz' : undefined}
                    onChange={(e) => setRole(u, e.target.value as Profile['role'])}>
                    <option value="chief">Şantiye şefi</option>
                    <option value="admin">Yönetici (ana firma)</option>
                  </select>
                </div>
                {u.role === 'chief' && (
                  sites.length === 0 ? <p className="mt-2 text-sm text-slate-500">Henüz şantiye yok. Önce Şantiyeler bölümünden şantiye ekleyin.</p> : (
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                      {sites.map((s) => (
                        <label key={s.id} className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" checked={own.has(s.id)} disabled={busy} onChange={(e) => toggleSite(u, s.id, e.target.checked)} />
                          {s.name}
                        </label>
                      ))}
                      {own.size === 0 && <span className="text-sm text-amber-700">Şantiye atanmadı: bu kişi henüz hiçbir kaydı göremez.</span>}
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

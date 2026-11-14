import type { Company, Site } from '../../shared/types';

/**
 * Filtre için firma/şantiye seçimi. Değer: '' (tümü), 'c:ID' (firmanın bütün şantiyeleri), 's:ID' (tek şantiye).
 */
export function ScopeSelect({ companies, sites, value, onChange, className = 'input w-64' }: {
  companies: Company[]; sites: Site[]; value: string; onChange: (v: string) => void; className?: string;
}) {
  return (
    <select className={className} value={value} onChange={(e) => onChange(e.target.value)} aria-label="Firma / şantiye filtresi">
      <option value="">Bütün firmalar ve şantiyeler</option>
      {companies.map((c) => (
        <optgroup key={c.id} label={c.name}>
          <option value={`c:${c.id}`}>{c.name} — bütün şantiyeler</option>
          {sites.filter((s) => s.companyId === c.id).map((s) => (
            <option key={s.id} value={`s:${s.id}`}>{s.name}{s.status === 'completed' ? ' (tamamlandı)' : ''}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

/** Kayıt formlarında tek şantiye seçimi (0 = şantiyesiz). Tamamlanan şantiyeler yalnızca seçiliyse listelenir. */
export function SiteSelect({ sites, value, onChange, name = 'site', emptyLabel = '— Şantiye yok —', className = 'input' }: {
  sites: Site[]; value: number | null; onChange: (v: number | null) => void; name?: string; emptyLabel?: string; className?: string;
}) {
  const companies = [...new Map(sites.map((s) => [s.companyId, s.companyName])).entries()];
  return (
    <select name={name} className={className} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value) || null)}>
      <option value={0}>{emptyLabel}</option>
      {companies.map(([cid, cname]) => (
        <optgroup key={cid} label={cname}>
          {sites.filter((s) => s.companyId === cid && (s.status === 'active' || s.id === value)).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

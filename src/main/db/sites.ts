// Firmalar (ana firma / işveren firmalar) ve onlara bağlı şantiyeler.
import type { Company, CompanyInput, Site, SiteFilter, SiteInput } from '../../shared/types';
import type { Db } from './connection';
import { logActivity } from './activity';
import { fail, id, optionalIsoDate, requiredText, text, trKey } from './validation';

// ---------- Firmalar ----------

export function listCompanies(db: Db): Company[] {
  return db.all<Company>(
    `SELECT c.id, c.name, c.tax_office AS taxOffice, c.tax_no AS taxNo, c.phone, c.address, c.notes,
            (SELECT COUNT(*) FROM sites s WHERE s.company_id = c.id) AS siteCount
     FROM companies c ORDER BY c.name COLLATE NOCASE`,
  );
}

function getCompany(db: Db, companyId: number): Company {
  const c = listCompanies(db).find((x) => x.id === companyId);
  if (!c) fail('Firma bulunamadı.');
  return c;
}

export function saveCompany(db: Db, companyId: number | undefined, input: CompanyInput): Company {
  if (!input || typeof input !== 'object') fail('Firma bilgileri eksik.');
  const v = {
    name: requiredText(input.name, 'Firma adı', 120),
    taxOffice: text(input.taxOffice, 80),
    taxNo: text(input.taxNo, 20),
    phone: text(input.phone, 30),
    address: text(input.address, 300),
    notes: text(input.notes, 1000),
  };
  if (v.taxNo && !/^\d{10,11}$/.test(v.taxNo)) fail('Vergi numarası 10 haneli (şahıs için 11 haneli T.C. no) olmalıdır.');
  const same = db.all<{ id: number; name: string }>('SELECT id, name FROM companies').find((c) => trKey(c.name) === trKey(v.name));
  if (same && same.id !== companyId) fail(`"${v.name}" adında bir firma zaten var.`);
  const savedId = db.tx(() => {
    if (companyId) {
      getCompany(db, id(companyId, 'Firma'));
      db.run(
        `UPDATE companies SET name = ?, tax_office = ?, tax_no = ?, phone = ?, address = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
        [v.name, v.taxOffice, v.taxNo, v.phone, v.address, v.notes, companyId],
      );
      logActivity(db, 'site', companyId, 'update', `Firma güncellendi: ${v.name}`);
      return companyId;
    }
    const { lastId } = db.run(
      'INSERT INTO companies (name, tax_office, tax_no, phone, address, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [v.name, v.taxOffice, v.taxNo, v.phone, v.address, v.notes],
    );
    logActivity(db, 'site', lastId, 'create', `Firma eklendi: ${v.name}`);
    return lastId;
  });
  return getCompany(db, savedId);
}

export function deleteCompany(db: Db, companyId: number) {
  const c = getCompany(db, id(companyId, 'Firma'));
  if (c.siteCount > 0) fail(`"${c.name}" firmasına bağlı ${c.siteCount} şantiye var. Önce şantiyeleri silin veya başka firmaya taşıyın.`);
  db.tx(() => {
    db.run('DELETE FROM companies WHERE id = ?', [c.id]);
    logActivity(db, 'site', c.id, 'delete', `Firma silindi: ${c.name}`);
  });
}

// ---------- Şantiyeler ----------

export function listSites(db: Db): Site[] {
  return db.all<Site>(
    `SELECT s.id, s.company_id AS companyId, c.name AS companyName, s.name, s.address,
            s.start_date AS startDate, s.end_date AS endDate, s.status, s.notes,
            (SELECT COUNT(*) FROM employees e WHERE e.site_id = s.id AND e.status = 'active') AS employeeCount
     FROM sites s JOIN companies c ON c.id = s.company_id
     ORDER BY s.status ASC, c.name COLLATE NOCASE, s.name COLLATE NOCASE`,
  );
}

export function getSite(db: Db, siteId: number): Site {
  const s = listSites(db).find((x) => x.id === siteId);
  if (!s) fail('Şantiye bulunamadı.');
  return s;
}

/** Şantiye seçimi doğrulama: null/undefined/0 -> null (şantiyesiz), aksi halde var olmalı. */
export function optionalSiteId(db: Db, v: unknown): number | null {
  if (v === null || v === undefined || v === 0 || v === '') return null;
  const siteId = id(v, 'Şantiye');
  if (!db.get('SELECT 1 FROM sites WHERE id = ?', [siteId])) fail('Seçilen şantiye bulunamadı.');
  return siteId;
}

export function saveSite(db: Db, siteId: number | undefined, input: SiteInput): Site {
  if (!input || typeof input !== 'object') fail('Şantiye bilgileri eksik.');
  const companyId = id(input.companyId, 'Firma');
  if (!db.get('SELECT 1 FROM companies WHERE id = ?', [companyId])) fail('Seçilen firma bulunamadı.');
  const v = {
    name: requiredText(input.name, 'Şantiye adı', 120),
    address: text(input.address, 300),
    startDate: optionalIsoDate(input.startDate, 'Başlangıç tarihi'),
    endDate: optionalIsoDate(input.endDate, 'Bitiş tarihi'),
    status: input.status === 'completed' ? 'completed' : 'active',
    notes: text(input.notes, 1000),
  };
  if (v.startDate && v.endDate && v.startDate > v.endDate) fail('Şantiye bitiş tarihi başlangıçtan önce olamaz.');
  const same = db.all<{ id: number; name: string }>('SELECT id, name FROM sites WHERE company_id = ?', [companyId]).find((x) => trKey(x.name) === trKey(v.name));
  if (same && same.id !== siteId) fail(`Bu firmada "${v.name}" adında bir şantiye zaten var.`);
  const savedId = db.tx(() => {
    if (siteId) {
      getSite(db, id(siteId, 'Şantiye'));
      db.run(
        `UPDATE sites SET company_id = ?, name = ?, address = ?, start_date = ?, end_date = ?, status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
        [companyId, v.name, v.address, v.startDate, v.endDate, v.status, v.notes, siteId],
      );
      logActivity(db, 'site', siteId, 'update', `Şantiye güncellendi: ${v.name}`);
      return siteId;
    }
    const { lastId } = db.run(
      'INSERT INTO sites (company_id, name, address, start_date, end_date, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [companyId, v.name, v.address, v.startDate, v.endDate, v.status, v.notes],
    );
    logActivity(db, 'site', lastId, 'create', `Şantiye eklendi: ${v.name}`);
    return lastId;
  });
  return getSite(db, savedId);
}

/** Mesai, gider veya rapor kaydı olan şantiye silinmez; "Tamamlandı" yapılması önerilir. */
export function deleteSite(db: Db, siteId: number): { deleted: boolean; reason?: string } {
  const s = getSite(db, id(siteId, 'Şantiye'));
  const count = (t: string) => db.get<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t} WHERE site_id = ?`, [s.id])!.c;
  const ot = count('overtime_records');
  const ex = count('expenses');
  const rp = count('daily_reports');
  if (ot + ex + rp > 0) {
    return {
      deleted: false,
      reason: `"${s.name}" şantiyesine bağlı ${ot} mesai, ${ex} gider ve ${rp} günlük rapor var. Geçmiş kayıtların korunması için silinemez; bunun yerine "Tamamlandı" olarak işaretleyebilirsiniz.`,
    };
  }
  db.tx(() => {
    // Bu şantiyedeki çalışanlar şantiyesiz kalır (ON DELETE SET NULL).
    db.run('DELETE FROM sites WHERE id = ?', [s.id]);
    logActivity(db, 'site', s.id, 'delete', `Şantiye silindi: ${s.name}`);
  });
  return { deleted: true };
}

/** Sorgulara eklenecek şantiye/firma koşulu. */
export function siteCondition(alias: string, f: SiteFilter | undefined): { sql: string; params: number[] } | null {
  if (f?.siteId) return { sql: `${alias}.site_id = ?`, params: [Number(f.siteId)] };
  if (f?.companyId) return { sql: `${alias}.site_id IN (SELECT id FROM sites WHERE company_id = ?)`, params: [Number(f.companyId)] };
  return null;
}

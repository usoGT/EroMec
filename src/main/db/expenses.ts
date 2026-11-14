import type { Category, CreateResult, Expense, ExpenseFilter, ExpenseInput, SalaryPaymentInput } from '../../shared/types';
import { formatDate, formatPeriod, isValidIsoDate } from '../../shared/dates';
import { formatMoney } from '../../shared/money';
import type { Db } from './connection';
import { logActivity } from './activity';
import { fail, id, isoDate, kurus, period, requiredText, text, trKey } from './validation';
import { optionalSiteId, siteCondition } from './sites';

const SELECT = `
  SELECT x.id, x.date, x.name, x.category_id AS categoryId, c.name AS categoryName, c.kind AS categoryKind,
         x.amount_kurus AS amountKurus, x.is_paid AS isPaid, x.description,
         x.employee_id AS employeeId, e.full_name AS employeeName, x.salary_period AS salaryPeriod,
         x.site_id AS siteId, s.name AS siteName, x.created_at AS createdAt
  FROM expenses x
  JOIN expense_categories c ON c.id = x.category_id
  LEFT JOIN employees e ON e.id = x.employee_id
  LEFT JOIN sites s ON s.id = x.site_id`;

type Row = Omit<Expense, 'isPaid'> & { isPaid: number };
const map = (r: Row): Expense => ({ ...r, isPaid: r.isPaid === 1 });

export function listCategories(db: Db): Category[] {
  return db
    .all<{ id: number; name: string; kind: Category['kind']; isSystem: number; expenseCount: number }>(
      `SELECT c.id, c.name, c.kind, c.is_system AS isSystem,
              (SELECT COUNT(*) FROM expenses x WHERE x.category_id = c.id) AS expenseCount
       FROM expense_categories c ORDER BY c.sort_order, c.name`,
    )
    .map((c) => ({ ...c, isSystem: c.isSystem === 1 }));
}

const KINDS: Category['kind'][] = ['salary', 'overtime', 'other'];

/** Yeni kategori. Tür: "salary" maaş gideri, "overtime" ek mesai ödemesi, "other" genel gider. */
export function createCategory(db: Db, args: { name: string; kind?: Category['kind'] } | string): Category {
  const a = typeof args === 'string' ? { name: args, kind: 'other' as const } : args;
  const name = requiredText(a?.name, 'Kategori adı', 60);
  const kind = a?.kind ?? 'other';
  if (!KINDS.includes(kind)) fail('Kategori türü geçersiz.');
  if (listCategories(db).some((c) => trKey(c.name) === trKey(name))) fail(`"${name}" kategorisi zaten var.`);
  const newId = db.tx(() => {
    const { lastId } = db.run(`INSERT INTO expense_categories (name, kind, is_system, sort_order) VALUES (?, ?, 0, 100)`, [name, kind]);
    logActivity(db, 'settings', lastId, 'create', `Gider kategorisi eklendi: ${name}`);
    return lastId;
  });
  return listCategories(db).find((c) => c.id === newId)!;
}

/** Kategorinin adı ve türü değiştirilebilir; korumalı kategorilerin (Personel maaşı, Ek mesai) yalnızca adı değişir. */
export function updateCategory(db: Db, args: { id: number; name: string; kind: Category['kind'] }): Category {
  const c = listCategories(db).find((x) => x.id === id(args?.id, 'Kategori'));
  if (!c) fail('Kategori bulunamadı.');
  if (c.isSystem && args.kind !== c.kind) fail(`"${c.name}" bordro için kullanılır; türü değiştirilemez (adını değiştirebilirsiniz).`);
  const name = requiredText(args.name, 'Kategori adı', 60);
  if (!KINDS.includes(args.kind)) fail('Kategori türü geçersiz.');
  if (listCategories(db).some((x) => x.id !== c.id && trKey(x.name) === trKey(name))) fail(`"${name}" kategorisi zaten var.`);
  if (args.kind !== 'salary' && db.get('SELECT 1 FROM expenses WHERE category_id = ? AND salary_period IS NOT NULL', [c.id])) {
    fail('Bu kategoride maaş ödemeleri var; türü maaş olarak kalmalıdır.');
  }
  db.tx(() => {
    db.run('UPDATE expense_categories SET name = ?, kind = ? WHERE id = ?', [name, args.kind, c.id]);
    logActivity(db, 'settings', c.id, 'update', `Gider kategorisi güncellendi: ${name}`);
  });
  return listCategories(db).find((x) => x.id === c.id)!;
}

/**
 * Kategoriyi siler. Kategoride gider varsa moveToId ile seçilen kategoriye taşınır (kayıt kaybolmaz).
 * "Personel maaşı" ve "Ek mesai" bordro için gerekli olduğundan silinemez.
 */
export function deleteCategory(db: Db, categoryId: number, moveToId?: number | null) {
  const all = listCategories(db);
  const c = all.find((x) => x.id === id(categoryId, 'Kategori'));
  if (!c) fail('Kategori bulunamadı.');
  if (c.isSystem) fail(`"${c.name}" bordro ve mesai ödemeleri için gereklidir; silinemez (adını değiştirebilirsiniz).`);
  let target: Category | undefined;
  if (c.expenseCount > 0) {
    if (!moveToId) fail(`"${c.name}" kategorisinde ${c.expenseCount} gider kaydı var; silmeden önce giderlerin taşınacağı kategoriyi seçin.`);
    target = all.find((x) => x.id === moveToId);
    if (!target || target.id === c.id) fail('Giderlerin taşınacağı kategori geçersiz.');
    if (target.kind !== 'salary' && db.get('SELECT 1 FROM expenses WHERE category_id = ? AND salary_period IS NOT NULL', [c.id])) {
      fail('Bu kategoride maaş ödemeleri var; yalnızca maaş türündeki bir kategoriye taşınabilir.');
    }
  }
  db.tx(() => {
    if (target) db.run(`UPDATE expenses SET category_id = ?, updated_at = datetime('now') WHERE category_id = ?`, [target.id, c.id]);
    db.run('DELETE FROM expense_categories WHERE id = ?', [c.id]);
    logActivity(db, 'settings', c.id, 'delete',
      `Gider kategorisi silindi: ${c.name}${target ? ` (${c.expenseCount} gider "${target.name}" kategorisine taşındı)` : ''}`);
  });
}

export function listExpenses(db: Db, f: ExpenseFilter): Expense[] {
  const parts: string[] = [];
  const params: (string | number)[] = [];
  if (f?.from && isValidIsoDate(f.from)) { parts.push('x.date >= ?'); params.push(f.from); }
  if (f?.to && isValidIsoDate(f.to)) { parts.push('x.date <= ?'); params.push(f.to); }
  if (f?.categoryId) { parts.push('x.category_id = ?'); params.push(Number(f.categoryId)); }
  if (f?.paid === 'paid') parts.push('x.is_paid = 1');
  if (f?.paid === 'unpaid') parts.push('x.is_paid = 0');
  const sc = siteCondition('x', f);
  if (sc) { parts.push(sc.sql); params.push(...sc.params); }
  let rows = db.all<Row>(`${SELECT}${parts.length ? ` WHERE ${parts.join(' AND ')}` : ''} ORDER BY x.date DESC, x.id DESC`, params).map(map);
  const q = f?.search?.trim().toLocaleLowerCase('tr-TR');
  if (q) {
    // Türkçe büyük/küçük harf (İ/ı) uyumu için arama JavaScript tarafında yapılır.
    rows = rows.filter((r) => `${r.name} ${r.description}`.toLocaleLowerCase('tr-TR').includes(q));
  }
  return rows;
}

export function getExpense(db: Db, expenseId: number): Expense {
  const r = db.get<Row>(`${SELECT} WHERE x.id = ?`, [id(expenseId)]);
  if (!r) fail('Gider kaydı bulunamadı.');
  return map(r);
}

function validate(db: Db, input: ExpenseInput) {
  if (!input || typeof input !== 'object') fail('Gider bilgileri eksik.');
  const categoryId = id(input.categoryId, 'Kategori');
  const cat = db.get<{ name: string; kind: string }>('SELECT name, kind FROM expense_categories WHERE id = ?', [categoryId]);
  if (!cat) fail('Seçilen kategori bulunamadı.');
  const name = text(input.name, 150) || cat.name; // Gider adı boşsa kategori adı kullanılır.
  return {
    date: isoDate(input.date, 'Tarih'),
    name,
    categoryId,
    categoryKind: cat.kind,
    amountKurus: kurus(input.amountKurus, 'Tutar'),
    isPaid: input.isPaid ? 1 : 0,
    description: text(input.description, 500),
    siteId: optionalSiteId(db, input.siteId),
  };
}

export function createExpense(db: Db, raw: ExpenseInput, force = false): CreateResult<Expense> {
  const v = validate(db, raw);
  if (!force) {
    const same = db.get(
      'SELECT 1 FROM expenses WHERE date = ? AND name = ? AND category_id = ? AND amount_kurus = ?',
      [v.date, v.name, v.categoryId, v.amountKurus],
    );
    if (same) {
      return { duplicate: `${formatDate(v.date)} tarihinde aynı ad, kategori ve tutarla (${formatMoney(v.amountKurus)}) bir gider zaten var. Yine de eklensin mi?` };
    }
  }
  const newId = db.tx(() => {
    const { lastId } = db.run(
      'INSERT INTO expenses (date, name, category_id, amount_kurus, is_paid, description, site_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [v.date, v.name, v.categoryId, v.amountKurus, v.isPaid, v.description, v.siteId],
    );
    logActivity(db, 'expense', lastId, 'create', `Gider eklendi: ${v.name}, ${formatMoney(v.amountKurus)}`);
    return lastId;
  });
  return { item: getExpense(db, newId) };
}

export function updateExpense(db: Db, expenseId: number, raw: ExpenseInput): Expense {
  const existing = getExpense(db, expenseId);
  const v = validate(db, raw);
  if (existing.salaryPeriod && v.categoryKind !== 'salary') {
    fail('Bu kayıt bir maaş ödemesidir; kategorisi yalnızca maaş kategorisi olabilir.');
  }
  db.tx(() => {
    db.run(
      `UPDATE expenses SET date = ?, name = ?, category_id = ?, amount_kurus = ?, is_paid = ?, description = ?, site_id = ?, updated_at = datetime('now') WHERE id = ?`,
      [v.date, v.name, v.categoryId, v.amountKurus, v.isPaid, v.description, v.siteId, existing.id],
    );
    logActivity(db, 'expense', existing.id, 'update', `Gider güncellendi: ${v.name}, ${formatMoney(v.amountKurus)}`);
  });
  return getExpense(db, existing.id);
}

export function deleteExpense(db: Db, expenseId: number) {
  const e = getExpense(db, expenseId);
  // Bordrodan oluşan maaş/mesai satırları birlikte silinir (bordro kaydı da kalkar).
  const pr = db.get<{ expense_id: number; overtime_expense_id: number | null }>(
    'SELECT expense_id, overtime_expense_id FROM payrolls WHERE expense_id = ? OR overtime_expense_id = ?', [e.id, e.id]);
  db.tx(() => {
    if (pr) {
      if (pr.overtime_expense_id) db.run('DELETE FROM expenses WHERE id = ?', [pr.overtime_expense_id]);
      db.run('DELETE FROM expenses WHERE id = ?', [pr.expense_id]);
    }
    db.run('DELETE FROM expenses WHERE id = ?', [e.id]);
    logActivity(db, 'expense', e.id, 'delete', `Gider silindi: ${e.name}, ${formatMoney(e.amountKurus)}`);
  });
}

/**
 * Maaş ödemesi kaydı: "Personel maaşı" kategorisinde, çalışana ve aya bağlı bir gider oluşturur.
 * Aynı çalışan + aynı ay için ikinci kayıt engellenir. Maaşlar otomatik oluşturulmaz.
 */
export function createSalaryPayment(db: Db, input: SalaryPaymentInput): Expense {
  if (!input || typeof input !== 'object') fail('Maaş ödemesi bilgileri eksik.');
  const employeeId = id(input.employeeId, 'Çalışan');
  const emp = db.get<{ full_name: string; site_id: number | null }>('SELECT full_name, site_id FROM employees WHERE id = ?', [employeeId]);
  if (!emp) fail('Seçilen çalışan bulunamadı.');
  const p = period(input.period);
  const date = isoDate(input.date, 'Ödeme tarihi');
  const amount = kurus(input.amountKurus, 'Tutar');
  if (amount === 0) fail('Maaş tutarı 0 olamaz.');
  const cat = db.get<{ id: number }>(`SELECT id FROM expense_categories WHERE kind = 'salary' ORDER BY sort_order LIMIT 1`);
  if (!cat) fail('Personel maaşı kategorisi bulunamadı.');
  if (db.get('SELECT 1 FROM expenses WHERE employee_id = ? AND salary_period = ?', [employeeId, p])) {
    fail(`${emp.full_name} için ${formatPeriod(p)} maaş ödemesi zaten kaydedilmiş. Aynı ay için ikinci kayıt oluşturulamaz.`);
  }
  const name = `Maaş - ${emp.full_name} (${formatPeriod(p)})`;
  const newId = db.tx(() => {
    const { lastId } = db.run(
      `INSERT INTO expenses (date, name, category_id, amount_kurus, is_paid, description, employee_id, salary_period, site_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [date, name, cat.id, amount, input.isPaid ? 1 : 0, text(input.description, 500), employeeId, p, emp.site_id],
    );
    logActivity(db, 'expense', lastId, 'create', `Maaş ödemesi kaydedildi: ${emp.full_name}, ${formatPeriod(p)}, ${formatMoney(amount)}`);
    return lastId;
  });
  return getExpense(db, newId);
}

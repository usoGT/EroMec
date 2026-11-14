import type { CreateResult, Employee, EmployeeDetail, EmployeeInput, EmployeeStatus } from '../../shared/types';
import type { Db } from './connection';
import { logActivity } from './activity';
import { listOvertime } from './overtime';
import { listExpenses } from './expenses';
import { fail, id, kurus, optionalIsoDate, requiredText, text, trKey } from './validation';
import { optionalSiteId } from './sites';
import { isValidIban, isValidNationalId, normalizeIban, BLOOD_TYPES } from '../../shared/identity';

const SELECT = `
  SELECT e.id, e.employee_no AS employeeNo, e.full_name AS fullName, e.position,
         e.monthly_salary_kurus AS monthlySalaryKurus, e.overtime_rate_kurus AS overtimeRateKurus,
         e.start_date AS startDate, e.status, e.phone, e.notes,
         e.site_id AS siteId, s.name AS siteName, c.name AS companyName,
         e.national_id AS nationalId, e.iban, e.bank_name AS bankName, e.birth_date AS birthDate,
         e.address, e.blood_type AS bloodType, e.emergency_name AS emergencyName,
         e.emergency_phone AS emergencyPhone, e.sgk_no AS sgkNo,
         e.created_at AS createdAt, e.updated_at AS updatedAt
  FROM employees e
  LEFT JOIN sites s ON s.id = e.site_id
  LEFT JOIN companies c ON c.id = s.company_id`;

type Validated = Required<Omit<EmployeeInput, 'siteId' | 'startDate' | 'birthDate'>> & {
  siteId: number | null; startDate: string | null; birthDate: string | null;
};

function validate(db: Db, input: EmployeeInput): Validated {
  if (!input || typeof input !== 'object') fail('Çalışan bilgileri eksik.');
  const status = input.status === 'left' ? 'left' : 'active';
  const nationalId = text(input.nationalId, 11);
  if (nationalId && !isValidNationalId(nationalId)) fail('T.C. kimlik numarası geçersiz (11 hane, kontrol hanesi tutmuyor).');
  const iban = normalizeIban(text(input.iban, 40));
  if (iban && !isValidIban(iban)) fail('IBAN geçersiz. TR ile başlayan 26 karakterlik IBAN girin (ör. TR12 0006 1005 1978 6457 8413 26).');
  const bloodType = text(input.bloodType, 10);
  if (bloodType && !BLOOD_TYPES.includes(bloodType)) fail('Kan grubu geçersiz.');
  return {
    siteId: optionalSiteId(db, input.siteId),
    nationalId,
    iban,
    bankName: text(input.bankName, 80),
    birthDate: optionalIsoDate(input.birthDate, 'Doğum tarihi'),
    address: text(input.address, 300),
    bloodType,
    emergencyName: text(input.emergencyName, 100),
    emergencyPhone: text(input.emergencyPhone, 30),
    sgkNo: text(input.sgkNo, 30),
    fullName: requiredText(input.fullName, 'Ad soyad', 100),
    position: requiredText(input.position, 'Görev', 100),
    monthlySalaryKurus: kurus(input.monthlySalaryKurus ?? 0, 'Aylık maaş'),
    overtimeRateKurus: kurus(input.overtimeRateKurus ?? 0, 'Saatlik mesai ücreti'),
    startDate: optionalIsoDate(input.startDate, 'İşe başlama tarihi'),
    status,
    phone: text(input.phone, 30),
    notes: text(input.notes, 1000),
  };
}

export function listEmployees(db: Db): Employee[] {
  return db.all<Employee>(`${SELECT} ORDER BY e.status ASC, e.full_name COLLATE NOCASE ASC`);
}

export function getEmployee(db: Db, employeeId: number): Employee {
  const e = db.get<Employee>(`${SELECT} WHERE e.id = ?`, [id(employeeId, 'Çalışan')]);
  if (!e) fail('Çalışan bulunamadı.');
  return e;
}

// Çevrimiçi sürümde numara sunucudan alınır (şef bütün çalışanları göremediği için yerel en büyük numara yanıltır).
let reservedEmployeeNo: string | null = null;
export function setReservedEmployeeNo(no: string | null) {
  reservedEmployeeNo = no;
}

function nextEmployeeNo(db: Db): string {
  if (reservedEmployeeNo) return reservedEmployeeNo;
  const row = db.get<{ n: number }>(
    `SELECT COALESCE(MAX(CAST(substr(employee_no, 2) AS INTEGER)), 0) AS n FROM employees WHERE employee_no GLOB 'P[0-9]*'`,
  );
  return `P${String((row?.n ?? 0) + 1).padStart(4, '0')}`;
}

function checkNationalIdUnique(db: Db, nationalId: string, selfId?: number) {
  if (!nationalId) return;
  const other = db.get<{ id: number; full_name: string }>('SELECT id, full_name FROM employees WHERE national_id = ?', [nationalId]);
  if (other && other.id !== selfId) fail(`Bu T.C. kimlik numarası zaten "${other.full_name}" adına kayıtlı.`);
}

const EXTRA_COLS = 'site_id, national_id, iban, bank_name, birth_date, address, blood_type, emergency_name, emergency_phone, sgk_no';
const extraValues = (v: Validated) => [v.siteId, v.nationalId, v.iban, v.bankName, v.birthDate, v.address, v.bloodType, v.emergencyName, v.emergencyPhone, v.sgkNo];

export function createEmployee(db: Db, raw: EmployeeInput, force = false): CreateResult<Employee> {
  const input = validate(db, raw);
  checkNationalIdUnique(db, input.nationalId);
  if (!force) {
    const same = db
      .all<{ employee_no: string; full_name: string }>(`SELECT employee_no, full_name FROM employees WHERE status = 'active'`)
      .find((e) => trKey(e.full_name) === trKey(input.fullName));
    if (same) return { duplicate: `"${input.fullName}" adında aktif bir çalışan zaten var (${same.employee_no}). Yine de eklensin mi?` };
  }
  const newId = db.tx(() => {
    const { lastId } = db.run(
      `INSERT INTO employees (employee_no, full_name, position, monthly_salary_kurus, overtime_rate_kurus, start_date, status, phone, notes, ${EXTRA_COLS})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nextEmployeeNo(db), input.fullName, input.position, input.monthlySalaryKurus, input.overtimeRateKurus,
        input.startDate, input.status, input.phone, input.notes, ...extraValues(input)],
    );
    logActivity(db, 'employee', lastId, 'create', `Yeni çalışan eklendi: ${input.fullName}`);
    return lastId;
  });
  return { item: getEmployee(db, newId) };
}

export function updateEmployee(db: Db, employeeId: number, raw: EmployeeInput): Employee {
  const existing = getEmployee(db, employeeId);
  const input = validate(db, raw);
  checkNationalIdUnique(db, input.nationalId, existing.id);
  db.tx(() => {
    // Not: Maaş veya saatlik ücret değişikliği geçmiş mesai kayıtlarını ETKİLEMEZ;
    // her mesai kaydı kendi ücretini ve tutarını saklar.
    db.run(
      `UPDATE employees SET full_name = ?, position = ?, monthly_salary_kurus = ?, overtime_rate_kurus = ?,
         start_date = ?, status = ?, phone = ?, notes = ?, site_id = ?, national_id = ?, iban = ?, bank_name = ?,
         birth_date = ?, address = ?, blood_type = ?, emergency_name = ?, emergency_phone = ?, sgk_no = ?,
         updated_at = datetime('now') WHERE id = ?`,
      [input.fullName, input.position, input.monthlySalaryKurus, input.overtimeRateKurus, input.startDate,
        input.status, input.phone, input.notes, ...extraValues(input), existing.id],
    );
    logActivity(db, 'employee', existing.id, 'update', `Çalışan güncellendi: ${input.fullName}`);
  });
  return getEmployee(db, existing.id);
}

export function setEmployeeStatus(db: Db, employeeId: number, status: EmployeeStatus): Employee {
  const e = getEmployee(db, employeeId);
  if (status !== 'active' && status !== 'left') fail('Geçersiz durum.');
  db.tx(() => {
    db.run(`UPDATE employees SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, e.id]);
    logActivity(db, 'employee', e.id, 'update',
      status === 'left' ? `Çalışan ayrıldı olarak işaretlendi: ${e.fullName}` : `Çalışan tekrar aktif yapıldı: ${e.fullName}`);
  });
  return getEmployee(db, e.id);
}

/**
 * Çalışanı yalnızca hiçbir mesai veya gider kaydına bağlı değilse siler.
 * Bağlı kayıt varsa silmez; arayüz "Ayrıldı olarak işaretle" seçeneği sunar.
 */
export function deleteEmployee(db: Db, employeeId: number): { deleted: boolean; reason?: string } {
  const e = getEmployee(db, employeeId);
  const ot = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM overtime_records WHERE employee_id = ?', [e.id])!.c;
  const ex = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM expenses WHERE employee_id = ?', [e.id])!.c;
  const at = db.get<{ c: number }>('SELECT COUNT(*) AS c FROM attendance WHERE employee_id = ?', [e.id])!.c;
  if (ot > 0 || ex > 0 || at > 0) {
    return {
      deleted: false,
      reason: `${e.fullName} adına ${ot} mesai, ${ex} maaş ödemesi ve ${at} günlük puantaj kaydı var. Geçmiş kayıtların kaybolmaması için çalışan silinemez; bunun yerine "Ayrıldı" olarak işaretleyebilirsiniz.`,
    };
  }
  db.tx(() => {
    db.run('DELETE FROM employees WHERE id = ?', [e.id]);
    logActivity(db, 'employee', e.id, 'delete', `Çalışan silindi: ${e.fullName}`);
  });
  return { deleted: true };
}

export function getEmployeeDetail(db: Db, employeeId: number): EmployeeDetail {
  const employee = getEmployee(db, employeeId);
  const ot = db.get<{ c: number; m: number; k: number }>(
    'SELECT COUNT(*) AS c, COALESCE(SUM(worked_minutes),0) AS m, COALESCE(SUM(total_kurus),0) AS k FROM overtime_records WHERE employee_id = ?',
    [employee.id],
  )!;
  const salaryPayments = listExpenses(db, {}).filter((x) => x.employeeId === employee.id && x.salaryPeriod);
  return {
    employee,
    overtimeCount: ot.c,
    overtimeMinutesTotal: ot.m,
    overtimeKurusTotal: ot.k,
    salaryPaymentCount: salaryPayments.length,
    salaryPaidKurusTotal: salaryPayments.reduce((s, x) => s + x.amountKurus, 0),
    recentOvertime: listOvertime(db, { employeeId: employee.id }).slice(0, 20),
    salaryPayments,
  };
}

/** Seçilen çalışanları tek seferde bir şantiyeye atar (siteId null: şantiyesiz). */
export function assignEmployeesToSite(db: Db, employeeIds: number[], siteIdRaw: number | null): number {
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) fail('Çalışan seçilmedi.');
  const siteId = optionalSiteId(db, siteIdRaw);
  const ids = employeeIds.map((x) => id(x, 'Çalışan'));
  const siteName = siteId ? db.get<{ name: string }>('SELECT name FROM sites WHERE id = ?', [siteId])!.name : 'şantiyesiz';
  db.tx(() => {
    for (const eid of ids) {
      const r = db.run(`UPDATE employees SET site_id = ?, updated_at = datetime('now') WHERE id = ?`, [siteId, eid]);
      if (r.changes === 0) fail('Seçilen çalışanlardan biri bulunamadı.');
    }
    logActivity(db, 'employee', null, 'update', `${ids.length} çalışan şantiyeye atandı: ${siteName}`);
  });
  return ids.length;
}

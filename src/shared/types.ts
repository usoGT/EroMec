import type { AttendanceStatus, StatusDef } from './attendance';
import type { PayResult } from './payroll';

// Ana süreç ile arayüz arasında paylaşılan veri tipleri.
// Bütün para alanları kuruş (tam sayı), tarih alanları "YYYY-AA-GG".

export type EmployeeStatus = 'active' | 'left';

export interface Employee {
  id: number;
  employeeNo: string;
  fullName: string;
  position: string;
  monthlySalaryKurus: number;
  overtimeRateKurus: number; // varsayılan saatlik mesai ücreti
  startDate: string | null;
  status: EmployeeStatus;
  phone: string;
  notes: string;
  siteId: number | null;
  siteName: string | null;
  companyName: string | null;
  nationalId: string; // T.C. kimlik no
  iban: string;
  bankName: string;
  birthDate: string | null;
  address: string;
  bloodType: string;
  emergencyName: string;
  emergencyPhone: string;
  sgkNo: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmployeeInput {
  fullName: string;
  position: string;
  monthlySalaryKurus: number;
  overtimeRateKurus: number;
  startDate: string | null;
  status: EmployeeStatus;
  phone?: string;
  notes?: string;
  siteId?: number | null;
  nationalId?: string;
  iban?: string;
  bankName?: string;
  birthDate?: string | null;
  address?: string;
  bloodType?: string;
  emergencyName?: string;
  emergencyPhone?: string;
  sgkNo?: string;
}

export interface EmployeeDetail {
  employee: Employee;
  overtimeCount: number;
  overtimeMinutesTotal: number;
  overtimeKurusTotal: number;
  salaryPaymentCount: number;
  salaryPaidKurusTotal: number;
  recentOvertime: OvertimeRecord[];
  salaryPayments: Expense[];
}

export interface OvertimeRecord {
  id: number;
  employeeId: number;
  employeeName: string;
  siteId: number | null;
  siteName: string | null;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  workedMinutes: number;
  hourlyRateKurus: number;
  totalKurus: number;
  description: string;
  createdAt: string;
}

export interface OvertimeInput {
  employeeId: number;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  hourlyRateKurus: number;
  description?: string;
  /** Verilmezse çalışanın bağlı olduğu şantiye kullanılır. */
  siteId?: number | null;
}

/** Şantiye / firma filtresi: siteId verilirse o şantiye, companyId verilirse firmanın bütün şantiyeleri. */
export interface SiteFilter {
  siteId?: number;
  companyId?: number;
}

export interface OvertimeFilter extends SiteFilter {
  from?: string;
  to?: string;
  employeeId?: number;
}

/** Toplu mesai: aynı saatlerde birden çok çalışana tek seferde mesai yazma. */
export interface BulkOvertimeInput {
  siteId: number | null;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  description?: string;
  /** Mesai yazılacak çalışanlar ve her birinin saatlik ücreti (kuruş) */
  entries: { employeeId: number; hourlyRateKurus: number }[];
}

export interface BulkOvertimeResult {
  created: number;
  totalKurus: number;
  skipped: { employeeName: string; reason: string }[];
}

export interface OvertimeTotals {
  dayMinutes: number;
  dayKurus: number;
  weekMinutes: number;
  weekKurus: number;
  monthMinutes: number;
  monthKurus: number;
  filteredMinutes: number;
  filteredKurus: number;
}

export type CategoryKind = 'salary' | 'overtime' | 'other';

export interface Category {
  id: number;
  name: string;
  kind: CategoryKind;
  /** Korumalı: bordronun kullandığı "Personel maaşı" ve "Ek mesai" (silinemez, türü değişmez) */
  isSystem: boolean;
  /** Bu kategorideki gider kaydı sayısı */
  expenseCount: number;
}

export interface Expense {
  id: number;
  date: string;
  name: string;
  categoryId: number;
  categoryName: string;
  categoryKind: CategoryKind;
  amountKurus: number;
  isPaid: boolean;
  description: string;
  employeeId: number | null;
  employeeName: string | null;
  salaryPeriod: string | null; // "YYYY-AA", yalnızca maaş ödemelerinde
  siteId: number | null;
  siteName: string | null;
  createdAt: string;
}

export interface ExpenseInput {
  date: string;
  name: string;
  categoryId: number;
  amountKurus: number;
  isPaid: boolean;
  description?: string;
  siteId?: number | null;
}

export interface ExpenseFilter extends SiteFilter {
  from?: string;
  to?: string;
  categoryId?: number;
  paid?: 'paid' | 'unpaid';
  search?: string;
}

export interface SalaryPaymentInput {
  employeeId: number;
  period: string; // "YYYY-AA"
  date: string;
  amountKurus: number;
  isPaid: boolean;
  description?: string;
}

export interface Summary {
  from: string;
  to: string;
  siteId?: number;
  companyId?: number;
  salaryKurus: number; // kaydedilmiş maaş ödemeleri (Personel maaşı kategorisi)
  overtimeKurus: number; // mesai kayıtlarından hesaplanan maliyet
  overtimeMinutes: number;
  otherKurus: number; // maaş ve ek mesai dışındaki giderler
  totalKurus: number; // maaş + mesai + diğer
  paidKurus: number; // gider kayıtlarından ödenenler
  unpaidKurus: number; // gider kayıtlarından ödenmeyenler (borç)
  overtimeCategoryKurus: number; // "Ek mesai" kategorisindeki gider kayıtları (toplama dahil değil)
  expenseCount: number;
  overtimeCount: number;
  byCategory: { name: string; kind: CategoryKind; kurus: number; includedInTotal: boolean }[];
  // ---- MALİYET (yapılan işin bedeli) ----
  /** Puantajdan personel maliyeti: aylık maaş ÷ 30 × dönemde işaretlenen ücretli günler */
  costLaborKurus: number;
  costLaborDays: number;
  /** Mesai kayıtlarından (= overtimeKurus) */
  costOvertimeKurus: number;
  /** Maaş ve ek mesai dışındaki giderler (= otherKurus) */
  costOtherKurus: number;
  costTotalKurus: number;
  // ---- GİDER (kaydedilen ödemeler) ----
  expSalaryKurus: number; // maaş türündeki kategoriler
  expOvertimeKurus: number; // ek mesai ödemesi türündeki kategoriler
  expOtherKurus: number;
  expTotalKurus: number;
  /** Maliyet − gider: pozitifse henüz gidere işlenmemiş (ödenmemiş/kaydedilmemiş) maliyet var */
  diffKurus: number;
  /** Dönemin içindeki tam aylar için puantajdan hesaplanan ama bordrosu henüz kaydedilmemiş normal maaşlar (bilgi) */
  pendingSalaryKurus: number;
  pendingSalaryCount: number;
  pendingMonths: string[];
}

export interface Dashboard {
  today: string;
  activeEmployeeCount: number;
  totalEmployeeCount: number;
  todayOvertimeMinutes: number;
  todayTotalKurus: number;
  weekTotalKurus: number;
  monthTotalKurus: number;
  /** İlk kayıttan bugüne (ve gelecek tarihli kayıtlar dahil) bütün maliyet */
  allTimeTotalKurus: number;
  totalUnpaidKurus: number;
  recent: ActivityEntry[];
}

export interface ActivityEntry {
  id: number;
  createdAt: string;
  entity: 'employee' | 'overtime' | 'expense' | 'settings' | 'backup' | 'site' | 'report' | 'attendance';
  action: 'create' | 'update' | 'delete' | 'restore';
  summary: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

export interface Company {
  id: number;
  name: string;
  taxOffice: string;
  taxNo: string;
  phone: string;
  address: string;
  notes: string;
  siteCount: number;
}

export type CompanyInput = Omit<Company, 'id' | 'siteCount'>;

export type SiteStatus = 'active' | 'completed';

export interface Site {
  id: number;
  companyId: number;
  companyName: string;
  name: string;
  address: string;
  startDate: string | null;
  endDate: string | null;
  status: SiteStatus;
  notes: string;
  employeeCount: number;
}

export type SiteInput = Omit<Site, 'id' | 'companyName' | 'employeeCount'>;

export interface DailyReport {
  id: number;
  date: string;
  siteId: number | null;
  siteName: string | null;
  weather: string;
  workDone: string;
  notes: string;
  updatedAt: string;
}

export interface DailyReportInput {
  date: string;
  siteId: number | null;
  weather?: string;
  workDone?: string;
  notes?: string;
}

/** Takvimde bir günün özeti */
export interface CalendarDay {
  date: string;
  overtimeMinutes: number;
  overtimeKurus: number;
  overtimeCount: number;
  expenseKurus: number;
  expenseCount: number;
  reportCount: number;
}

/** Takvimde bir güne tıklayınca gösterilen bilgiler */
export interface DayDetail {
  date: string;
  summary: Summary;
  overtime: OvertimeRecord[];
  expenses: Expense[];
  reports: DailyReport[];
}

export interface AttendanceRow {
  employeeId: number;
  employeeNo: string;
  fullName: string;
  position: string;
  nationalId: string;
  status: EmployeeStatus;
  siteId: number | null;
  siteName: string | null;
  companyName: string | null;
  /** tarih -> durum kodu */
  cells: Record<string, AttendanceStatus>;
  /** tarih -> o günkü mesai süresi (dakika) */
  overtime: Record<string, number>;
  overtimeMinutes: number;
  overtimeKurus: number;
  monthlySalaryKurus: number;
}

export interface AttendanceMonth {
  month: string; // "YYYY-AA"
  days: string[]; // ayın bütün günleri
  rows: AttendanceRow[];
  /** Ayarlar'daki günlük asgari ücret (maaş sütunları için) */
  dailyMinWageKurus: number;
  /** Puantaj fırçaları (düzenlenebilir) */
  statuses: StatusDef[];
}

export type StatusInput = Pick<StatusDef, 'short' | 'label' | 'color' | 'paidHalf' | 'workedHalf'>;

/** Bordroya kaydedilmiş (kilitlenmiş) maaş değerleri */
export interface PayrollSnapshot {
  id: number;
  expenseId: number;
  paidHalfDays: number;
  monthlySalaryKurus: number;
  normalKurus: number;
  overtimeMinutes: number;
  overtimeKurus: number;
  totalKurus: number;
  officialKurus: number;
  cashKurus: number;
  dailyMinWageKurus: number;
  isPaid: boolean;
  createdAt: string;
}

export interface PayrollRow {
  employeeId: number;
  employeeNo: string;
  fullName: string;
  position: string;
  nationalId: string;
  iban: string;
  status: EmployeeStatus;
  siteName: string | null;
  companyName: string | null;
  hasAttendance: boolean;
  /** Puantaj + mesaiden anlık hesap */
  live: PayResult & { monthlySalaryKurus: number; overtimeMinutes: number };
  /** Bordroya kaydedildiyse kilitli değerler */
  saved: PayrollSnapshot | null;
}

export interface PayrollMonth {
  month: string;
  dailyMinWageKurus: number;
  rows: PayrollRow[];
}

export interface AttendanceEntry {
  employeeId: number;
  date: string;
  /** null: hücreyi temizle */
  status: AttendanceStatus | null;
}

export interface AppSettings {
  companyName: string;
  appName: string;
  currency: string;
  /** Görünüm: açık, koyu (gece modu) veya Windows ayarına göre */
  theme: ThemeMode;
  /** Bordroda resmi (asgari) kısmın hesaplandığı günlük asgari ücret, kuruş */
  dailyMinWageKurus: number;
}

export interface CreateResult<T> {
  /** Benzer kayıt varsa ve force verilmediyse kayıt eklenmez, uyarı döner. */
  duplicate?: string;
  item?: T;
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

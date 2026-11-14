// IPC sözleşmesi: arayüzün çağırabileceği bütün işlemler burada tanımlıdır.
// preload yalnızca bu listedeki kanalları açar.
import type {
  AppSettings, Category, CreateResult, Dashboard, Employee, EmployeeDetail, EmployeeInput,
  Expense, ExpenseFilter, ExpenseInput, OvertimeFilter, OvertimeInput, OvertimeRecord,
  OvertimeTotals, SalaryPaymentInput, Summary, ActivityEntry, BulkOvertimeInput, BulkOvertimeResult,
  Company, CompanyInput, Site, SiteInput, SiteFilter, DailyReport, DailyReportInput, CalendarDay, DayDetail,
  AttendanceMonth, AttendanceEntry, PayrollMonth, StatusInput,
} from './types';
import type { StatusDef } from './attendance';

export interface EroMecApi {
  employeesList(): Promise<Employee[]>;
  employeeGet(id: number): Promise<EmployeeDetail>;
  employeeCreate(args: { input: EmployeeInput; force?: boolean }): Promise<CreateResult<Employee>>;
  employeeUpdate(args: { id: number; input: EmployeeInput }): Promise<Employee>;
  employeeDelete(id: number): Promise<{ deleted: boolean; reason?: string }>;
  employeeSetStatus(args: { id: number; status: 'active' | 'left' }): Promise<Employee>;

  overtimeList(filter: OvertimeFilter): Promise<OvertimeRecord[]>;
  overtimeTotals(args: { today: string; filter: OvertimeFilter }): Promise<OvertimeTotals>;
  overtimeCreate(args: { input: OvertimeInput; force?: boolean }): Promise<CreateResult<OvertimeRecord>>;
  overtimeUpdate(args: { id: number; input: OvertimeInput }): Promise<OvertimeRecord>;
  overtimeDelete(id: number): Promise<void>;
  overtimeBulkCreate(input: BulkOvertimeInput): Promise<BulkOvertimeResult>;
  employeesAssignSite(args: { employeeIds: number[]; siteId: number | null }): Promise<number>;

  companiesList(): Promise<Company[]>;
  companySave(args: { id?: number; input: CompanyInput }): Promise<Company>;
  companyDelete(id: number): Promise<void>;
  sitesList(): Promise<Site[]>;
  siteSave(args: { id?: number; input: SiteInput }): Promise<Site>;
  siteDelete(id: number): Promise<{ deleted: boolean; reason?: string }>;

  calendarMonth(args: { from: string; to: string } & SiteFilter): Promise<CalendarDay[]>;
  dayDetail(args: { date: string } & SiteFilter): Promise<DayDetail>;
  dailyReportSave(input: DailyReportInput): Promise<DailyReport>;
  dailyReportDelete(id: number): Promise<void>;

  attendanceMonth(args: { month: string } & SiteFilter): Promise<AttendanceMonth>;
  /** Puantaj hücrelerini toplu yazar/temizler (tek işlem). siteId: kayıtlara yazılacak şantiye */
  attendanceSet(args: { entries: AttendanceEntry[]; siteId?: number | null }): Promise<{ changed: number }>;
  /** Boş iş günlerini "Çalıştı", boş pazarları "Hafta tatili" ile doldurur. */
  attendanceFill(args: { month: string; employeeIds: number[]; workSaturday: boolean; untilToday: boolean; siteId?: number | null; today?: string }): Promise<{ changed: number }>;
  attendanceExport(args: { month: string; format: 'xlsx' | 'pdf' } & SiteFilter): Promise<{ saved: boolean; path?: string }>;
  attendanceStatusesList(): Promise<StatusDef[]>;
  /** Fırçayı günceller (code verilirse) veya yeni fırça ekler */
  attendanceStatusSave(args: { code?: string; input: StatusInput }): Promise<StatusDef>;
  attendanceStatusDelete(code: string): Promise<void>;

  payrollMonth(args: { month: string } & SiteFilter): Promise<PayrollMonth>;
  /** Bordroyu kaydeder (değerler kilitlenir) ve maaş ödemesi giderini açar */
  payrollSave(args: { month: string; employeeIds: number[]; date: string; isPaid: boolean }): Promise<{ saved: number; totalKurus: number; skipped: { employeeName: string; reason: string }[] }>;
  payrollUndo(args: { employeeId: number; month: string }): Promise<void>;
  payrollExport(args: { month: string; format: 'xlsx' | 'pdf' } & SiteFilter): Promise<{ saved: boolean; path?: string }>;

  categoriesList(): Promise<Category[]>;
  categoryCreate(args: { name: string; kind: Category['kind'] }): Promise<Category>;
  categoryUpdate(args: { id: number; name: string; kind: Category['kind'] }): Promise<Category>;
  categoryDelete(args: { id: number; moveToId?: number | null }): Promise<void>;
  expensesList(filter: ExpenseFilter): Promise<Expense[]>;
  expenseCreate(args: { input: ExpenseInput; force?: boolean }): Promise<CreateResult<Expense>>;
  expenseUpdate(args: { id: number; input: ExpenseInput }): Promise<Expense>;
  expenseDelete(id: number): Promise<void>;
  salaryPaymentCreate(input: SalaryPaymentInput): Promise<Expense>;

  dashboard(today: string): Promise<Dashboard>;
  summary(args: { from: string; to: string } & SiteFilter): Promise<Summary>;
  activityList(limit: number): Promise<ActivityEntry[]>;
  reportExportCsv(args: { from: string; to: string; title: string } & SiteFilter): Promise<{ saved: boolean; path?: string }>;
  reportExportPdf(args: { from: string; to: string; title: string } & SiteFilter): Promise<{ saved: boolean; path?: string }>;

  settingsGet(): Promise<AppSettings>;
  settingsSave(s: AppSettings): Promise<AppSettings>;
  backupCreate(): Promise<{ saved: boolean; path?: string }>;
  /** Masaüstünde/yerelde: yedeği geri yükler. Çevrimiçi sürümde: yedekteki verileri hesaba aktarır (imported: özet). */
  backupRestore(): Promise<{ restored: boolean; path?: string; safetyCopy?: string; imported?: string }>;
  dbInfo(): Promise<{ path: string; schemaVersion: number }>;
}

export const API_METHODS: (keyof EroMecApi)[] = [
  'employeesList', 'employeeGet', 'employeeCreate', 'employeeUpdate', 'employeeDelete', 'employeeSetStatus',
  'overtimeList', 'overtimeTotals', 'overtimeCreate', 'overtimeUpdate', 'overtimeDelete', 'overtimeBulkCreate', 'employeesAssignSite',
  'companiesList', 'companySave', 'companyDelete', 'sitesList', 'siteSave', 'siteDelete',
  'calendarMonth', 'dayDetail', 'dailyReportSave', 'dailyReportDelete',
  'attendanceMonth', 'attendanceSet', 'attendanceFill', 'attendanceExport', 'attendanceStatusesList', 'attendanceStatusSave', 'attendanceStatusDelete',
  'payrollMonth', 'payrollSave', 'payrollUndo', 'payrollExport',
  'categoriesList', 'categoryCreate', 'categoryUpdate', 'categoryDelete', 'expensesList', 'expenseCreate', 'expenseUpdate', 'expenseDelete', 'salaryPaymentCreate',
  'dashboard', 'summary', 'activityList', 'reportExportCsv', 'reportExportPdf',
  'settingsGet', 'settingsSave', 'backupCreate', 'backupRestore', 'dbInfo',
];

export const IPC_PREFIX = 'eromec:';

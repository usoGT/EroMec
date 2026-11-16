// Veritabanı işlemlerinin tek giriş noktası. Electron'dan bağımsızdır; testlerde doğrudan kullanılır.
import type { Db } from './connection';
import * as employees from './employees';
import * as overtime from './overtime';
import * as expenses from './expenses';
import * as reports from './reports';
import * as settings from './settings';
import * as sites from './sites';
import * as calendar from './calendar';
import * as attendance from './attendance';
import type { AttendanceExportData } from './attendance-export';
import * as payroll from './payroll';
import type { PayrollExportData } from './payroll-export';
import { listActivity, logActivity } from './activity';
import { getSchemaVersion } from './migrations';
import { restoreBackup } from './backup';
import type { ReportData } from './export';
import type {
  EmployeeInput, ExpenseFilter, ExpenseInput, OvertimeFilter, OvertimeInput, SalaryPaymentInput, AppSettings,
  BulkOvertimeInput, CompanyInput, SiteInput, SiteFilter, DailyReportInput, AttendanceEntry, Category, StatusInput,
} from '../../shared/types';

const siteFilter = (a: SiteFilter | undefined): SiteFilter => ({ siteId: a?.siteId || undefined, companyId: a?.companyId || undefined });

export function createService(db: Db) {
  /** Rapor başlıklarında kullanılan kapsam açıklaması */
  const scopeLabel = (f: SiteFilter): string => {
    if (f.siteId) {
      const s = sites.getSite(db, f.siteId);
      return `${s.companyName} / ${s.name}`;
    }
    if (f.companyId) {
      const c = sites.listCompanies(db).find((x) => x.id === f.companyId);
      return c ? `${c.name} (bütün şantiyeler)` : '';
    }
    return 'Bütün firmalar ve şantiyeler';
  };

  return {
    employeesList: () => employees.listEmployees(db),
    employeeGet: (id: number) => employees.getEmployeeDetail(db, id),
    employeeCreate: (a: { input: EmployeeInput; force?: boolean }) => employees.createEmployee(db, a?.input, a?.force === true),
    employeeUpdate: (a: { id: number; input: EmployeeInput }) => employees.updateEmployee(db, a?.id, a?.input),
    employeeDelete: (id: number) => employees.deleteEmployee(db, id),
    employeeSetStatus: (a: { id: number; status: 'active' | 'left' }) => employees.setEmployeeStatus(db, a?.id, a?.status),

    overtimeList: (f: OvertimeFilter) => overtime.listOvertime(db, f ?? {}),
    overtimeTotals: (a: { today: string; filter: OvertimeFilter }) => overtime.overtimeTotals(db, a?.today, a?.filter ?? {}),
    overtimeCreate: (a: { input: OvertimeInput; force?: boolean }) => overtime.createOvertime(db, a?.input, a?.force === true),
    overtimeUpdate: (a: { id: number; input: OvertimeInput }) => overtime.updateOvertime(db, a?.id, a?.input),
    overtimeDelete: (id: number) => overtime.deleteOvertime(db, id),
    overtimeBulkCreate: (input: BulkOvertimeInput) => overtime.createOvertimeBulk(db, input),
    employeesAssignSite: (a: { employeeIds: number[]; siteId: number | null }) => employees.assignEmployeesToSite(db, a?.employeeIds, a?.siteId),

    companiesList: () => sites.listCompanies(db),
    companySave: (a: { id?: number; input: CompanyInput }) => sites.saveCompany(db, a?.id, a?.input),
    companyDelete: (id: number) => sites.deleteCompany(db, id),
    sitesList: () => sites.listSites(db),
    siteSave: (a: { id?: number; input: SiteInput }) => sites.saveSite(db, a?.id, a?.input),
    siteDelete: (id: number) => sites.deleteSite(db, id),

    calendarMonth: (a: { from: string; to: string } & SiteFilter) => calendar.calendarMonth(db, a?.from, a?.to, siteFilter(a)),
    dayDetail: (a: { date: string } & SiteFilter) => calendar.dayDetail(db, a?.date, siteFilter(a)),
    dailyReportSave: (input: DailyReportInput) => calendar.saveDailyReport(db, input),
    dailyReportDelete: (id: number) => calendar.deleteDailyReport(db, id),

    attendanceMonth: (a: { month: string } & SiteFilter) => attendance.attendanceMonth(db, a?.month, siteFilter(a)),
    attendanceSet: (a: { entries: AttendanceEntry[]; siteId?: number | null }) => attendance.setAttendance(db, a?.entries, a?.siteId),
    attendanceFill: (a: Parameters<typeof attendance.fillAttendance>[1]) => attendance.fillAttendance(db, a),
    attendanceStatusesList: () => attendance.listStatuses(db),
    attendanceStatusSave: (a: { code?: string; input: StatusInput }) => attendance.saveStatus(db, a?.code, a?.input),
    attendanceStatusDelete: (code: string) => attendance.deleteStatus(db, code),
    payrollMonth: (a: { month: string } & SiteFilter) => payroll.payrollMonth(db, a?.month, siteFilter(a)),
    payrollSave: (a: { month: string; employeeIds: number[]; date: string; isPaid: boolean }) => payroll.savePayroll(db, a),
    payrollUndo: (a: { employeeId: number; month: string }) => payroll.undoPayroll(db, a?.employeeId, a?.month),
    payrollExportData: (month: string, filter?: SiteFilter): PayrollExportData => {
      const f = siteFilter(filter);
      return {
        payroll: payroll.payrollMonth(db, month, f),
        companyName: settings.getSettings(db).companyName,
        scopeLabel: scopeLabel(f),
        currencySymbol: settings.currencySymbol(db),
        generatedAt: new Date(),
      };
    },
    attendanceExportData: (month: string, filter?: SiteFilter): AttendanceExportData => {
      const f = siteFilter(filter);
      return {
        month: attendance.attendanceMonth(db, month, f),
        companyName: settings.getSettings(db).companyName,
        currencySymbol: settings.currencySymbol(db),
        scopeLabel: scopeLabel(f),
        generatedAt: new Date(),
      };
    },

    categoriesList: () => expenses.listCategories(db),
    categoryCreate: (a: { name: string; kind: Category['kind'] }) => expenses.createCategory(db, a),
    categoryUpdate: (a: { id: number; name: string; kind: Category['kind'] }) => expenses.updateCategory(db, a),
    categoryDelete: (a: { id: number; moveToId?: number | null }) => expenses.deleteCategory(db, a?.id, a?.moveToId),
    expensesList: (f: ExpenseFilter) => expenses.listExpenses(db, f ?? {}),
    expenseCreate: (a: { input: ExpenseInput; force?: boolean }) => expenses.createExpense(db, a?.input, a?.force === true),
    expenseUpdate: (a: { id: number; input: ExpenseInput }) => expenses.updateExpense(db, a?.id, a?.input),
    expenseDelete: (id: number) => expenses.deleteExpense(db, id),
    salaryPaymentCreate: (input: SalaryPaymentInput) => expenses.createSalaryPayment(db, input),

    // Eski çağrılar için düz tarih de kabul edilir; yenisi { today, siteId?, companyId? }
    dashboard: (arg: string | ({ today: string } & SiteFilter)) =>
      typeof arg === 'string' ? reports.dashboard(db, arg) : reports.dashboard(db, arg?.today, siteFilter(arg)),
    summary: (a: { from: string; to: string } & SiteFilter) => reports.summary(db, a?.from, a?.to, siteFilter(a)),
    activityList: (limit: number) => listActivity(db, limit),

    settingsGet: () => settings.getSettings(db),
    settingsSave: (s: AppSettings) => settings.saveSettings(db, s),
    dbInfo: () => ({ path: db.filePath ?? '(bellek)', schemaVersion: getSchemaVersion(db) }),

    // Dışa aktarma ve yedekleme yardımcıları (dosya diyaloglarını ana süreç yönetir)
    reportData: (from: string, to: string, title: string, filter?: SiteFilter): ReportData => {
      const f = siteFilter(filter);
      return {
        title,
        scope: scopeLabel(f),
        settings: settings.getSettings(db),
        summary: reports.summary(db, from, to, f),
        expenses: expenses.listExpenses(db, { from, to, ...f }).reverse(),
        overtime: overtime.listOvertime(db, { from, to, ...f }).reverse(),
        generatedAt: new Date(),
      };
    },
    backupBytes: () => db.exportBytes(),
    restore: (bytes: Uint8Array) => {
      restoreBackup(db, bytes);
      db.tx(() => logActivity(db, 'backup', null, 'restore', 'Veriler yedekten geri yüklendi'));
    },
  };
}

export type Service = ReturnType<typeof createService>;

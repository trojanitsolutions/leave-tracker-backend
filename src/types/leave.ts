import { EmployeeLeaveStatus, Employee, LeaveDecisionStatus, LeaveExtension, LeaveRequest, UserRole } from "./entities";

export interface LeaveBalance {
  /** False until the employee's 13th-month eligibility date arrives — no entitlement exists yet. */
  isEligible: boolean;
  cycleStart: string;
  cycleEnd: string;
  entitlement: number;
  used: number;
  pending: number;
  remaining: number;
  nextCycleStartsOn: string | null;
}

/** A single row in an employee's merged leave + extension history. */
export interface LeaveHistoryEntry {
  id: number;
  kind: "leave" | "extension";
  parentLeaveRequestId: number | null;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  status: LeaveDecisionStatus;
  backToWorkDate: string;
  actualBackToWorkDate: string | null;
  submittedAt: string;
  decidedAt: string | null;
}

export interface EmployeeOverview {
  employee: Employee;
  managerName: string | null;
  managerDepartment: string | null;
  status: EmployeeLeaveStatus;
  currentLeave: LeaveRequest | null;
  currentExtension: LeaveExtension | null;
  balance: LeaveBalance;
  recent: LeaveHistoryEntry[];
}

export type LeaveCheckKey = "eligibility" | "balance" | "overlap";

export interface LeaveCheckItem {
  key: LeaveCheckKey;
  ok: boolean;
  title: string;
  body: string;
}

export interface TeamOverlapEntry {
  employeeId: number;
  name: string;
  dates: string;
}

export interface BalanceProjection {
  entitlement: number;
  used: number;
  pending: number;
  thisRequest: number;
  remainingAfter: number;
}

export interface PrecheckResult {
  days: number;
  checks: LeaveCheckItem[];
  canSubmit: boolean;
  balanceAfter: BalanceProjection;
  teamOverlap: TeamOverlapEntry[];
}

export interface ApplyLeaveInput {
  startDate: string;
  endDate: string;
  reason: string | null;
  attachmentName: string | null;
}

export type ExtensionCheckKey = "onLeave" | "contiguous" | "overlap";

export interface ExtensionCheckItem {
  key: ExtensionCheckKey;
  ok: boolean;
  title: string;
  body: string;
}

export interface ExtensionPrecheckResult {
  days: number;
  checks: ExtensionCheckItem[];
  canSubmit: boolean;
  currentLeave: LeaveRequest | null;
  newBackToWorkDate: string | null;
}

export interface ApplyExtensionInput {
  startDate: string;
  endDate: string;
  reason: string | null;
  attachmentName: string | null;
}

export interface ManagerQueueStats {
  awaitingYou: number;
  oldestInQueueDays: number;
  teamOutNextWeek: number;
  teamSize: number;
  notReturnedAsExpected: number;
}

export interface ManagerQueueItem {
  id: number;
  kind: "leave" | "extension";
  employeeId: number;
  employeeName: string;
  department: string | null;
  type: "Annual Leave" | "Unpaid Extension";
  startDate: string;
  endDate: string;
  numberOfDays: number;
  reason: string | null;
  attachmentName: string | null;
  backToWorkDate: string;
  submittedAt: string;
  balance: LeaveBalance;
  teamOverlap: TeamOverlapEntry[];
}

export interface ManagerQueueResult {
  stats: ManagerQueueStats;
  queue: ManagerQueueItem[];
}

export interface AdminStats {
  totalEmployees: number;
  departmentCount: number;
  currentlyOnLeave: number;
  upcomingThisMonth: number;
  notReturnedAsExpected: number;
  pendingApprovals: number;
  pendingOver3DaysOld: number;
}

export interface AdminBackToWorkRow {
  employeeId: number;
  name: string;
  department: string | null;
  expectedBackToWorkDate: string;
  actualBackToWorkDate: string | null;
  status: "Returned" | "Upcoming" | "Overdue";
}

export interface AdminEligibilityCandidate {
  employeeId: number;
  name: string;
  joiningDate: string;
  daysUntilEligible: number;
}

export interface AdminDepartmentLoad {
  department: string;
  onLeave: number;
  headcount: number;
}

export interface AdminOverview {
  stats: AdminStats;
  backToWorkWatchlist: AdminBackToWorkRow[];
  approachingEligibility: AdminEligibilityCandidate[];
  departmentLoad: AdminDepartmentLoad[];
}

export interface ManagerOverviewStats {
  teamSize: number;
  currentlyOnLeave: number;
  pendingApprovals: number;
  teamOutNextWeek: number;
  notReturnedAsExpected: number;
}

export interface ManagerOnLeaveRow {
  employeeId: number;
  name: string;
  department: string | null;
  type: "Annual Leave" | "Unpaid Extension";
  startDate: string;
  endDate: string;
  expectedBackToWorkDate: string;
}

export interface ManagerOverview {
  stats: ManagerOverviewStats;
  currentlyOnLeave: ManagerOnLeaveRow[];
  backToWorkWatchlist: AdminBackToWorkRow[];
}

export interface TeamHistoryRow {
  employeeId: number;
  employeeName: string;
  department: string | null;
  kind: "leave" | "extension";
  type: "Annual Leave" | "Unpaid Extension";
  startDate: string;
  endDate: string;
  numberOfDays: number;
  status: LeaveDecisionStatus;
  decidedByName: string | null;
  submittedAt: string;
}

export interface TeamCalendarBar {
  startDate: string;
  endDate: string;
  type: "Annual Leave" | "Unpaid Extension";
  status: LeaveDecisionStatus;
}

export interface TeamCalendarPerson {
  employeeId: number;
  name: string;
  department: string | null;
  bars: TeamCalendarBar[];
}

export interface TeamCalendarResult {
  month: string;
  people: TeamCalendarPerson[];
}

export interface EmployeeDirectoryRow {
  employee: Employee;
  managerName: string | null;
  balance: LeaveBalance;
}

export interface AdminLeaveRecordFilter {
  employeeId?: number;
  department?: string;
  managerId?: number;
  kind?: "leave" | "extension";
  status?: LeaveDecisionStatus;
  from?: string;
  to?: string;
}

export interface AdminLeaveRecordRow {
  id: number;
  employeeId: number;
  employeeName: string;
  department: string | null;
  kind: "leave" | "extension";
  type: "Annual Leave" | "Unpaid Extension";
  startDate: string;
  endDate: string;
  numberOfDays: number;
  reason: string | null;
  status: LeaveDecisionStatus;
  expectedBackToWorkDate: string | null;
  actualBackToWorkDate: string | null;
  submittedAt: string;
}

export interface CorrectLeaveRecordInput {
  startDate?: string;
  endDate?: string;
  reason?: string | null;
  status?: LeaveDecisionStatus;
}

export interface RecordBackToWorkInput {
  actualBackToWorkDate: string;
}

export interface AdminReportsResult {
  cycleLabel: string;
  year: number;
  availableYears: number[];
  department: string | null;
  departments: string[];
  stats: {
    daysTakenYtd: number;
    daysTakenPriorPeriod: number;
    deltaPercent: number;
    avgPerEmployee: number;
    avgEntitlement: number;
    overdueCount: number;
    overdueNames: string[];
    unpaidDays: number;
    unpaidPendingCount: number;
    unpaidApprovedCount: number;
  };
  monthly: { label: string; days: number; heightPercent: number }[];
  leaveTypeSplit: { type: "Annual Leave" | "Unpaid Extension"; days: number; percent: number }[];
  departmentTable: {
    name: string;
    headcount: number;
    daysTaken: number;
    utilizationPercent: number;
    pending: number;
    liabilityDays: number;
  }[];
  totalLiabilityDays: number;
}

export interface AuditHistoryRow {
  id: number;
  employeeName: string;
  performedByName: string;
  performedByRole: UserRole;
  action: string;
  actionLabel: string;
  leaveRequestId: number | null;
  leaveRequestSummary: string | null;
  performedAt: string;
}

export type UserRole = "employee" | "manager" | "admin";

export type LeaveDecisionStatus = "pending" | "approved" | "rejected" | "cancelled";

export type EmployeeLeaveStatus = "not_on_leave" | "on_annual_leave" | "on_unpaid_extension" | "returned";

export interface Employee {
  id: number;
  employeeCode: string;
  fullName: string;
  email: string;
  department: string | null;
  role: UserRole;
  managerId: number | null;
  joiningDate: string;
  annualEntitlementDays: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequest {
  id: number;
  employeeId: number;
  managerId: number;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  reason: string | null;
  attachmentUrl: string | null;
  status: LeaveDecisionStatus;
  expectedBackToWorkDate: string;
  actualBackToWorkDate: string | null;
  submittedAt: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveExtension {
  id: number;
  leaveRequestId: number;
  employeeId: number;
  managerId: number;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  reason: string | null;
  attachmentUrl: string | null;
  status: LeaveDecisionStatus;
  submittedAt: string;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLogEntry {
  id: number;
  employeeId: number;
  performedByEmployeeId: number;
  action: string;
  leaveRequestId: number | null;
  extensionId: number | null;
  details: Record<string, unknown> | null;
  performedAt: string;
}

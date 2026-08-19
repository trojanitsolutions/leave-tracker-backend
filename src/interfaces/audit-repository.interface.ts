import { AuditLogEntry } from "../types/entities";

export interface AuditLogFilter {
  employeeId?: number;
  leaveRequestId?: number;
  extensionId?: number;
  from?: string;
  to?: string;
}

export interface CreateAuditLogInput {
  employeeId: number;
  performedByEmployeeId: number;
  action: string;
  leaveRequestId?: number | null;
  extensionId?: number | null;
  details?: Record<string, unknown> | null;
}

export interface IAuditRepository {
  findByEmployeeId(employeeId: number): Promise<AuditLogEntry[]>;
  findAll(filter?: AuditLogFilter): Promise<AuditLogEntry[]>;
  record(entry: CreateAuditLogInput): Promise<AuditLogEntry>;
}

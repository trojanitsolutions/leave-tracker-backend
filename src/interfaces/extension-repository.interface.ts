import { LeaveDecisionStatus, LeaveExtension } from "../types/entities";

export interface ExtensionFilter {
  employeeId?: number;
  managerId?: number;
  leaveRequestId?: number;
  status?: LeaveDecisionStatus;
}

export interface CreateLeaveExtensionInput {
  leaveRequestId: number;
  employeeId: number;
  managerId: number;
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  reason: string | null;
  attachmentName: string | null;
  attachmentUrl: string | null;
}

export interface IExtensionRepository {
  findById(id: number): Promise<LeaveExtension | null>;
  findByLeaveRequestId(leaveRequestId: number): Promise<LeaveExtension[]>;
  findByEmployeeId(employeeId: number): Promise<LeaveExtension[]>;
  findPendingByManagerId(managerId: number): Promise<LeaveExtension[]>;
  findAll(filter?: ExtensionFilter): Promise<LeaveExtension[]>;
  create(data: CreateLeaveExtensionInput): Promise<LeaveExtension>;
  updateStatus(id: number, status: LeaveDecisionStatus): Promise<LeaveExtension>;
  delete(id: number): Promise<void>;
}

import { LeaveDecisionStatus, LeaveRequest } from "../types/entities";

export interface LeaveRequestFilter {
  employeeId?: number;
  managerId?: number;
  department?: string;
  status?: LeaveDecisionStatus;
  from?: string;
  to?: string;
}

export interface CreateLeaveRequestInput {
  employeeId: number;
  managerId: number;
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  numberOfDays: number;
  reason: string | null;
  attachmentName: string | null;
  attachmentUrl: string | null;
  expectedBackToWorkDate: string;
}

export interface ILeaveRepository {
  findById(id: number): Promise<LeaveRequest | null>;
  findByEmployeeId(employeeId: number): Promise<LeaveRequest[]>;
  findPendingByManagerId(managerId: number): Promise<LeaveRequest[]>;
  findAll(filter?: LeaveRequestFilter): Promise<LeaveRequest[]>;
  findOverlapping(employeeId: number, startDate: string, endDate: string): Promise<LeaveRequest[]>;
  create(data: CreateLeaveRequestInput): Promise<LeaveRequest>;
  updateStatus(id: number, status: LeaveDecisionStatus): Promise<LeaveRequest>;
  updateFields(
    id: number,
    data: {
      startDate?: string;
      endDate?: string;
      numberOfDays?: number;
      reason?: string | null;
      status?: LeaveDecisionStatus;
    },
  ): Promise<LeaveRequest>;
  recordActualBackToWork(id: number, actualBackToWorkDate: string | null): Promise<LeaveRequest>;
  updateExpectedBackToWork(id: number, expectedBackToWorkDate: string): Promise<LeaveRequest>;
  delete(id: number): Promise<void>;
}

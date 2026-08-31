import { LeaveType } from "../types/entities";

export interface CreateLeaveTypeInput {
  name: string;
  isPaid: boolean;
  requiresEligibility: boolean;
  defaultEntitlementDays: number | null;
  sortOrder?: number;
}

export interface UpdateLeaveTypeInput {
  name?: string;
  isPaid?: boolean;
  requiresEligibility?: boolean;
  defaultEntitlementDays?: number | null;
  sortOrder?: number;
}

export interface ILeaveTypeRepository {
  findAll(): Promise<LeaveType[]>;
  findById(id: number): Promise<LeaveType | null>;
  findByCode(code: string): Promise<LeaveType | null>;
  create(data: CreateLeaveTypeInput): Promise<LeaveType>;
  update(id: number, data: UpdateLeaveTypeInput): Promise<LeaveType>;
  setActive(id: number, isActive: boolean): Promise<LeaveType>;
  getEmployeeEntitlementOverride(employeeId: number, leaveTypeId: number): Promise<number | null>;
  countUsage(leaveTypeId: number): Promise<number>;
  delete(id: number): Promise<void>;
}

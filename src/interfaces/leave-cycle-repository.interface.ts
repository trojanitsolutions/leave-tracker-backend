export type LeaveCycleGeneratedReason = "initial" | "renewal";

export interface LeaveCycle {
  id: number;
  employeeId: number;
  cycleStart: string;
  cycleEnd: string;
  entitlementDays: number;
  generatedReason: LeaveCycleGeneratedReason;
  sourceLeaveRequestId: number | null;
  createdAt: string;
}

export interface CreateLeaveCycleInput {
  employeeId: number;
  cycleStart: string;
  cycleEnd: string;
  entitlementDays: number;
  generatedReason: LeaveCycleGeneratedReason;
  sourceLeaveRequestId: number | null;
}

export interface ILeaveCycleRepository {
  findByEmployeeId(employeeId: number): Promise<LeaveCycle[]>;
  findByEmployeeAndStart(employeeId: number, cycleStart: string): Promise<LeaveCycle | null>;
  create(data: CreateLeaveCycleInput): Promise<LeaveCycle>;
  deleteBySourceLeaveRequestId(employeeId: number, leaveRequestId: number): Promise<void>;
}

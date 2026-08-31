import { Employee, UserRole } from "../types/entities";

export interface EmployeeFilter {
  department?: string;
  managerId?: number;
  role?: UserRole;
  isActive?: boolean;
  search?: string;
}

export interface CreateEmployeeInput {
  employeeCode: string;
  fullName: string;
  email: string;
  password: string;
  department: string | null;
  role: UserRole;
  managerId: number | null;
  joiningDate: string;
  annualEntitlementDays: number;
}

export type UpdateEmployeeInput = Partial<CreateEmployeeInput> & { isActive?: boolean };

export interface EmployeeWithCredentials extends Employee {
  passwordHash: string;
  tokenVersion: number;
}

export interface EmployeeAuthState {
  id: number;
  role: UserRole;
  isActive: boolean;
  tokenVersion: number;
}

export interface IEmployeeRepository {
  findById(id: number): Promise<Employee | null>;
  findByEmail(email: string): Promise<Employee | null>;
  findByEmailWithCredentials(email: string): Promise<EmployeeWithCredentials | null>;
  findByIdWithCredentials(id: number): Promise<EmployeeWithCredentials | null>;
  findAuthState(id: number): Promise<EmployeeAuthState | null>;
  incrementTokenVersion(id: number): Promise<void>;
  findByManagerId(managerId: number): Promise<Employee[]>;
  findAll(filter?: EmployeeFilter): Promise<Employee[]>;
  create(data: CreateEmployeeInput): Promise<Employee>;
  update(id: number, data: UpdateEmployeeInput): Promise<Employee>;
  updatePassword(id: number, passwordHash: string): Promise<void>;
  delete(id: number): Promise<void>;
  hasLeaveHistory(id: number): Promise<boolean>;
}

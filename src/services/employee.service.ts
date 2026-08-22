import { ApiError } from "../common/ApiError";
import { sendWelcomeEmail } from "../common/mailer";
import { IAuditRepository } from "../interfaces/audit-repository.interface";
import {
  CreateEmployeeInput,
  EmployeeFilter,
  IEmployeeRepository,
  UpdateEmployeeInput,
} from "../interfaces/employee-repository.interface";
import { Employee, UserRole } from "../types/entities";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_ROLES: UserRole[] = ["employee", "manager", "admin"];
const MAX_ANNUAL_ENTITLEMENT_DAYS = 365;
const MIN_PASSWORD_LENGTH = 8;

interface MysqlDuplicateError {
  code?: string;
}

export class EmployeeService {
  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly auditRepository: IAuditRepository,
  ) {}

  async list(filter: EmployeeFilter): Promise<Employee[]> {
    return this.employeeRepository.findAll(filter);
  }

  async get(id: number): Promise<Employee> {
    const employee = await this.employeeRepository.findById(id);
    if (!employee) {
      throw ApiError.notFound("Employee not found");
    }
    return employee;
  }

  async create(
    input: CreateEmployeeInput,
    performedByEmployeeId: number,
  ): Promise<{ employee: Employee; emailSent: boolean }> {
    if (!input.employeeCode?.trim()) {
      throw ApiError.badRequest("Employee code is required.");
    }
    if (!input.fullName?.trim()) {
      throw ApiError.badRequest("Full name is required.");
    }
    this.validateEmail(input.email);
    this.validatePassword(input.password);
    this.validateRole(input.role);
    if (input.role === "manager") {
      throw ApiError.badRequest(
        "Manager accounts aren't created here — provision them with the create-manager script, then assign them as a reporting manager.",
      );
    }
    if (!input.joiningDate) {
      throw ApiError.badRequest("Joining date is required.");
    }
    this.validateEntitlement(input.annualEntitlementDays);
    if (input.managerId !== null) {
      await this.requireManager(input.managerId);
    }

    let created: Employee;
    try {
      created = await this.employeeRepository.create(input);
    } catch (err) {
      throw this.mapWriteError(err);
    }

    await this.auditRepository.record({
      employeeId: created.id,
      performedByEmployeeId,
      action: "employee_created",
      details: { employeeCode: created.employeeCode, role: created.role },
    });

    const emailSent = await sendWelcomeEmail(created.email, created.fullName, input.password);

    return { employee: created, emailSent };
  }

  async update(
    id: number,
    input: UpdateEmployeeInput,
    performedByEmployeeId: number,
  ): Promise<Employee> {
    const before = await this.get(id);

    if (input.fullName !== undefined && !input.fullName.trim()) {
      throw ApiError.badRequest("Full name is required.");
    }
    if (input.email !== undefined) {
      this.validateEmail(input.email);
    }
    if (input.role !== undefined) {
      this.validateRole(input.role);
      // A manager's role is fixed once provisioned via the create-manager script — this
      // endpoint can neither promote someone into it nor demote an existing manager out of it.
      // Resubmitting the same, unchanged role (e.g. a locked form field) is fine either way.
      if (input.role !== before.role && (input.role === "manager" || before.role === "manager")) {
        throw ApiError.badRequest("A manager's role can't be changed here.");
      }
    }
    if (input.annualEntitlementDays !== undefined) {
      this.validateEntitlement(input.annualEntitlementDays);
    }
    if (input.managerId !== undefined && input.managerId !== null) {
      if (input.managerId === id) {
        throw ApiError.badRequest("An employee can't be their own manager.");
      }
      await this.requireManager(input.managerId);
    }

    let updated: Employee;
    try {
      updated = await this.employeeRepository.update(id, input);
    } catch (err) {
      throw this.mapWriteError(err);
    }

    await this.auditRepository.record({
      employeeId: id,
      performedByEmployeeId,
      action: "employee_updated",
      details: { fields: Object.keys(input) },
    });

    return updated;
  }

  private validatePassword(password: string): void {
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      throw ApiError.badRequest(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
  }

  private validateEmail(email: string): void {
    if (!EMAIL_RE.test(email)) {
      throw ApiError.badRequest("Enter a valid email address.");
    }
  }

  private validateRole(role: UserRole): void {
    if (!VALID_ROLES.includes(role)) {
      throw ApiError.badRequest("Invalid role.");
    }
  }

  private validateEntitlement(days: number): void {
    if (!Number.isInteger(days) || days < 0 || days > MAX_ANNUAL_ENTITLEMENT_DAYS) {
      throw ApiError.badRequest(
        `Annual entitlement must be a whole number between 0 and ${MAX_ANNUAL_ENTITLEMENT_DAYS}.`,
      );
    }
  }

  private async requireManager(managerId: number): Promise<void> {
    const manager = await this.employeeRepository.findById(managerId);
    if (!manager || manager.role !== "manager") {
      throw ApiError.badRequest("Selected manager must be an existing employee with the Manager role.");
    }
  }

  private mapWriteError(err: unknown): ApiError {
    if (err instanceof ApiError) return err;
    if (err instanceof Error && (err as MysqlDuplicateError).code === "ER_DUP_ENTRY") {
      return ApiError.conflict("That employee code or email is already in use.");
    }
    return ApiError.internal();
  }
}

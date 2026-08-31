import { ApiError } from "../common/ApiError";
import { IAuditRepository } from "../interfaces/audit-repository.interface";
import {
  CreateLeaveTypeInput,
  ILeaveTypeRepository,
  UpdateLeaveTypeInput,
} from "../interfaces/leave-type-repository.interface";
import { LeaveType } from "../types/entities";

export class LeaveTypeService {
  constructor(
    private readonly leaveTypeRepository: ILeaveTypeRepository,
    private readonly auditRepository: IAuditRepository,
  ) {}

  async list(): Promise<LeaveType[]> {
    return this.leaveTypeRepository.findAll();
  }

  async create(adminId: number, input: CreateLeaveTypeInput): Promise<LeaveType> {
    this.validateEntitlementShape(input.isPaid, input.defaultEntitlementDays ?? null);
    if (!input.name?.trim()) {
      throw ApiError.badRequest("Name is required.");
    }

    const created = await this.leaveTypeRepository.create(input);
    await this.auditRepository.record({
      employeeId: adminId,
      performedByEmployeeId: adminId,
      action: "leave_type_created",
      details: {
        leaveTypeId: created.id,
        name: created.name,
        isPaid: created.isPaid,
        requiresEligibility: created.requiresEligibility,
        defaultEntitlementDays: created.defaultEntitlementDays,
      },
    });
    return created;
  }

  async update(adminId: number, id: number, input: UpdateLeaveTypeInput): Promise<LeaveType> {
    const before = await this.requireType(id);

    if (before.isSystem) {
      const attemptingLockedChange =
        input.isPaid !== undefined ||
        input.requiresEligibility !== undefined ||
        input.defaultEntitlementDays !== undefined;
      if (attemptingLockedChange) {
        throw ApiError.forbidden("Only the name and sort order of a built-in leave type can be changed.");
      }
    }

    if (!before.isSystem) {
      const isPaid = input.isPaid ?? before.isPaid;
      const entitlement =
        input.defaultEntitlementDays !== undefined ? input.defaultEntitlementDays : before.defaultEntitlementDays;
      this.validateEntitlementShape(isPaid, entitlement);
    }

    const updated = await this.leaveTypeRepository.update(id, input);
    await this.auditRepository.record({
      employeeId: adminId,
      performedByEmployeeId: adminId,
      action: "leave_type_updated",
      details: { before, after: updated },
    });
    return updated;
  }

  async deactivate(adminId: number, id: number): Promise<LeaveType> {
    const type = await this.requireType(id);
    if (type.isSystem) {
      throw ApiError.forbidden("Built-in leave types can't be deactivated.");
    }
    const updated = await this.leaveTypeRepository.setActive(id, false);
    await this.auditRepository.record({
      employeeId: adminId,
      performedByEmployeeId: adminId,
      action: "leave_type_deactivated",
      details: { leaveTypeId: id, name: type.name },
    });
    return updated;
  }

  async reactivate(adminId: number, id: number): Promise<LeaveType> {
    const type = await this.requireType(id);
    const updated = await this.leaveTypeRepository.setActive(id, true);
    await this.auditRepository.record({
      employeeId: adminId,
      performedByEmployeeId: adminId,
      action: "leave_type_reactivated",
      details: { leaveTypeId: id, name: type.name },
    });
    return updated;
  }

  async remove(adminId: number, id: number): Promise<void> {
    const type = await this.requireType(id);
    if (type.isSystem) {
      throw ApiError.forbidden("Built-in leave types can't be deleted.");
    }
    const usage = await this.leaveTypeRepository.countUsage(id);
    if (usage > 0) {
      throw ApiError.badRequest(
        `Can't delete "${type.name}" — ${usage} leave record${usage === 1 ? "" : "s"} already reference it. Deactivate it instead.`,
      );
    }
    await this.leaveTypeRepository.delete(id);
    await this.auditRepository.record({
      employeeId: adminId,
      performedByEmployeeId: adminId,
      action: "leave_type_deleted",
      details: { leaveTypeId: id, name: type.name },
    });
  }

  private async requireType(id: number): Promise<LeaveType> {
    const type = await this.leaveTypeRepository.findById(id);
    if (!type) {
      throw ApiError.notFound("Leave type not found");
    }
    return type;
  }

  private validateEntitlementShape(isPaid: boolean, defaultEntitlementDays: number | null): void {
    if (isPaid && (defaultEntitlementDays === null || defaultEntitlementDays <= 0)) {
      throw ApiError.badRequest("A paid leave type needs a positive default entitlement.");
    }
    if (!isPaid && defaultEntitlementDays !== null) {
      throw ApiError.badRequest("An unpaid leave type can't have a default entitlement.");
    }
  }
}

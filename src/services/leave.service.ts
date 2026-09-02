import { ApiError } from "../common/ApiError";
import {
  addDays,
  addMonths,
  daysBetweenInclusive,
  formatHumanDate,
  isAfter,
  isBefore,
  parseISODate,
  rangesOverlap,
  todayUTC,
  toISODate,
} from "../common/dateMath";
import { AuditLogFilter } from "../interfaces/audit-repository.interface";
import { IAuditRepository } from "../interfaces/audit-repository.interface";
import { IEmployeeRepository } from "../interfaces/employee-repository.interface";
import { IExtensionRepository } from "../interfaces/extension-repository.interface";
import { ILeaveCycleRepository, LeaveCycle } from "../interfaces/leave-cycle-repository.interface";
import { ILeaveRepository } from "../interfaces/leave-repository.interface";
import { ILeaveTypeRepository } from "../interfaces/leave-type-repository.interface";
import { INotificationRepository, Notification } from "../interfaces/notification-repository.interface";
import { CompanySettings, ISettingsRepository, UpdateSettingsInput } from "../interfaces/settings-repository.interface";
import { Employee, EmployeeLeaveStatus, LeaveExtension, LeaveRequest, LeaveType } from "../types/entities";
import {
  AdminBackToWorkRow,
  AdminDepartmentLoad,
  AdminEligibilityCandidate,
  AdminLeaveRecordFilter,
  AdminLeaveRecordRow,
  AdminOverview,
  AdminReportsResult,
  ApplyExtensionInput,
  ApplyLeaveInput,
  AuditHistoryRow,
  CorrectLeaveRecordInput,
  EmployeeOverview,
  ExtensionCheckItem,
  ExtensionPrecheckResult,
  LeaveBalance,
  LeaveCheckItem,
  LeaveHistoryEntry,
  ManagerOnLeaveRow,
  ManagerOverview,
  ManagerQueueItem,
  ManagerQueueResult,
  PrecheckResult,
  TeamCalendarBar,
  TeamCalendarPerson,
  TeamCalendarResult,
  TeamHistoryRow,
  TeamOverlapEntry,
} from "../types/leave";

const MONTH_ABBREVIATIONS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
const AUDIT_ACTION_LABELS: Record<string, string> = {
  leave_submitted: "Submitted leave request",
  leave_approved: "Approved leave request",
  leave_rejected: "Rejected leave request",
  leave_decision_undone: "Reversed decision",
  extension_submitted: "Submitted extension request",
  extension_approved: "Approved extension request",
  extension_rejected: "Rejected extension request",
  extension_decision_undone: "Reversed extension decision",
  leave_type_created: "Created leave type",
  leave_type_updated: "Updated leave type",
  leave_type_deactivated: "Deactivated leave type",
  leave_type_reactivated: "Reactivated leave type",
  leave_type_deleted: "Deleted leave type",
  employee_created: "Created employee record",
  employee_updated: "Updated employee record",
  company_settings_updated: "Updated company settings",
  leave_cycle_generated: "Generated next leave cycle",
  leave_record_corrected: "Corrected leave record",
  back_to_work_recorded: "Recorded back-to-work date",
};
const RECENT_REQUESTS_LIMIT = 10;

export class LeaveService {
  private cachedUnpaidExtensionType: LeaveType | null = null;

  constructor(
    private readonly employeeRepository: IEmployeeRepository,
    private readonly leaveRepository: ILeaveRepository,
    private readonly auditRepository: IAuditRepository,
    private readonly extensionRepository: IExtensionRepository,
    private readonly settingsRepository: ISettingsRepository,
    private readonly leaveCycleRepository: ILeaveCycleRepository,
    private readonly notificationRepository: INotificationRepository,
    private readonly leaveTypeRepository: ILeaveTypeRepository,
  ) {}

  private async resolveLeaveType(leaveTypeId?: number): Promise<LeaveType> {
    if (leaveTypeId === undefined) {
      const annual = await this.leaveTypeRepository.findByCode("annual");
      if (!annual) {
        throw new Error("Annual leave type missing — migration didn't seed it");
      }
      return annual;
    }
    const type = await this.leaveTypeRepository.findById(leaveTypeId);
    if (!type || !type.isActive) {
      throw ApiError.badRequest("That leave type isn't available.");
    }
    return type;
  }

  private async getUnpaidExtensionType(): Promise<LeaveType> {
    if (this.cachedUnpaidExtensionType) {
      return this.cachedUnpaidExtensionType;
    }
    const type = await this.leaveTypeRepository.findByCode("unpaid_extension");
    if (!type) {
      throw new Error("Unpaid extension leave type missing — migration didn't seed it");
    }
    this.cachedUnpaidExtensionType = type;
    return type;
  }

  private async getLeaveTypesMap(): Promise<Map<number, LeaveType>> {
    const types = await this.leaveTypeRepository.findAll();
    return new Map(types.map((t) => [t.id, t]));
  }

  private emptyBalance(): LeaveBalance {
    const todayISO = toISODate(todayUTC());
    return {
      isEligible: true,
      cycleStart: todayISO,
      cycleEnd: todayISO,
      entitlement: 0,
      used: 0,
      pending: 0,
      remaining: 0,
      nextCycleStartsOn: null,
    };
  }

  async getOverview(employeeId: number): Promise<EmployeeOverview> {
    const employee = await this.requireEmployee(employeeId);
    const today = todayUTC();
    const settings = await this.settingsRepository.get();
    const leaveTypes = await this.leaveTypeRepository.findAll();
    const leaveTypesMap = new Map(leaveTypes.map((t) => [t.id, t]));
    const annualType = leaveTypes.find((t) => t.code === "annual");
    if (!annualType) {
      throw new Error("Annual leave type missing — migration didn't seed it");
    }

    const allRequests = await this.leaveRepository.findByEmployeeId(employeeId);
    const allExtensions = await this.extensionRepository.findByEmployeeId(employeeId);

    const currentLeave =
      allRequests.find(
        (r) =>
          r.status === "approved" &&
          !isAfter(parseISODate(r.startDate), today) &&
          !isBefore(parseISODate(r.endDate), today),
      ) ?? null;

    const currentExtension =
      allExtensions.find(
        (e) =>
          e.status === "approved" &&
          !isAfter(parseISODate(e.startDate), today) &&
          !isBefore(parseISODate(e.endDate), today),
      ) ?? null;

    let status: EmployeeLeaveStatus = "not_on_leave";
    let currentLeaveTypeName: string | null = null;
    if (currentLeave) {
      status = "on_leave";
      currentLeaveTypeName = leaveTypesMap.get(currentLeave.leaveTypeId)?.name ?? null;
    } else if (currentExtension) {
      status = "on_unpaid_extension";
      currentLeaveTypeName = leaveTypesMap.get(currentExtension.leaveTypeId)?.name ?? null;
    }

    let activeNextCycleStart: string | null = null;
    if (currentLeave) {
      activeNextCycleStart = currentLeave.expectedBackToWorkDate;
    } else if (currentExtension) {
      activeNextCycleStart = toISODate(addDays(parseISODate(currentExtension.endDate), 1));
    }

    const annualRequests = allRequests.filter((r) => r.leaveTypeId === annualType.id);
    const balance = await this.computeBalance(
      employee,
      annualRequests,
      today,
      today,
      settings,
      activeNextCycleStart,
    );

    const otherBalances: EmployeeOverview["otherBalances"] = [];
    for (const type of leaveTypes) {
      if (!type.isPaid || !type.isActive || type.code === "annual") continue;
      const requestsOfType = allRequests.filter((r) => r.leaveTypeId === type.id);
      const typeBalance = await this.computeSimpleTypeBalance(employee, type, requestsOfType, today, settings);
      otherBalances.push({ leaveTypeId: type.id, leaveTypeName: type.name, balance: typeBalance });
    }

    const recent = this.mergeHistory(allRequests, allExtensions, leaveTypesMap).slice(0, RECENT_REQUESTS_LIMIT);
    const manager = employee.managerId !== null ? await this.employeeRepository.findById(employee.managerId) : null;

    return {
      employee,
      managerName: manager?.fullName ?? null,
      managerDepartment: manager?.department ?? null,
      status,
      currentLeave,
      currentExtension,
      currentLeaveTypeName,
      balance,
      otherBalances,
      recent,
    };
  }

  async getHistory(employeeId: number): Promise<LeaveHistoryEntry[]> {
    await this.requireEmployee(employeeId);
    const allRequests = await this.leaveRepository.findByEmployeeId(employeeId);
    const allExtensions = await this.extensionRepository.findByEmployeeId(employeeId);
    const leaveTypesMap = await this.getLeaveTypesMap();
    return this.mergeHistory(allRequests, allExtensions, leaveTypesMap);
  }

  async getMyCycles(employeeId: number): Promise<LeaveCycle[]> {
    await this.requireEmployee(employeeId);
    return this.leaveCycleRepository.findByEmployeeId(employeeId);
  }

  private mergeHistory(
    requests: LeaveRequest[],
    extensions: LeaveExtension[],
    leaveTypesMap: Map<number, LeaveType>,
  ): LeaveHistoryEntry[] {
    const leaveEntries: LeaveHistoryEntry[] = requests.map((r) => ({
      id: r.id,
      kind: "leave",
      parentLeaveRequestId: null,
      leaveTypeId: r.leaveTypeId,
      leaveTypeName: leaveTypesMap.get(r.leaveTypeId)?.name ?? "Unknown",
      startDate: r.startDate,
      endDate: r.endDate,
      numberOfDays: r.numberOfDays,
      status: r.status,
      backToWorkDate: r.expectedBackToWorkDate,
      actualBackToWorkDate: r.actualBackToWorkDate,
      submittedAt: r.submittedAt,
      decidedAt: r.decidedAt,
    }));

    const extensionEntries: LeaveHistoryEntry[] = extensions.map((e) => ({
      id: e.id,
      kind: "extension",
      parentLeaveRequestId: e.leaveRequestId,
      leaveTypeId: e.leaveTypeId,
      leaveTypeName: leaveTypesMap.get(e.leaveTypeId)?.name ?? "Unpaid Extension",
      startDate: e.startDate,
      endDate: e.endDate,
      numberOfDays: e.numberOfDays,
      status: e.status,
      backToWorkDate: toISODate(addDays(parseISODate(e.endDate), 1)),
      actualBackToWorkDate: null,
      submittedAt: e.submittedAt,
      decidedAt: e.decidedAt,
    }));

    return [...leaveEntries, ...extensionEntries].sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  async precheck(
    employeeId: number,
    startDateInput: string,
    endDateInput: string,
    leaveTypeId?: number,
  ): Promise<PrecheckResult> {
    const employee = await this.requireEmployee(employeeId);
    this.validateDateShape(startDateInput, endDateInput);

    const startDate = parseISODate(startDateInput);
    const endDate = parseISODate(endDateInput);
    const days = daysBetweenInclusive(startDate, endDate);

    const leaveType = await this.resolveLeaveType(leaveTypeId);
    if (leaveType.isChildType) {
      throw ApiError.badRequest(
        `${leaveType.name} must be requested as an extension of an existing approved leave.`,
      );
    }

    const settings = await this.settingsRepository.get();
    const allRequests = await this.leaveRepository.findByEmployeeId(employeeId);
    const requestsOfType = allRequests.filter((r) => r.leaveTypeId === leaveType.id);
    const today = todayUTC();
    const balance = leaveType.isPaid
      ? await this.computeBalanceForType(employee, leaveType, requestsOfType, today, startDate, settings)
      : this.emptyBalance();

    const checks = await this.runChecks(employee, startDate, endDate, days, balance, settings, leaveType);
    const teamOverlap = await this.getTeamOverlap(employee, startDate, endDate);

    return {
      days,
      checks,
      canSubmit: checks.every((c) => c.ok),
      balanceAfter: {
        entitlement: balance.entitlement,
        used: balance.used,
        pending: balance.pending,
        thisRequest: days,
        remainingAfter: balance.remaining - days,
      },
      teamOverlap,
    };
  }

  async applyLeave(employeeId: number, input: ApplyLeaveInput): Promise<LeaveRequest> {
    const employee = await this.requireEmployee(employeeId);
    this.validateDateShape(input.startDate, input.endDate);

    const startDate = parseISODate(input.startDate);
    const endDate = parseISODate(input.endDate);
    const days = daysBetweenInclusive(startDate, endDate);

    const leaveType = await this.resolveLeaveType(input.leaveTypeId);
    if (leaveType.isChildType) {
      throw ApiError.badRequest(
        `${leaveType.name} must be requested as an extension of an existing approved leave.`,
      );
    }

    const settings = await this.settingsRepository.get();
    const allRequests = await this.leaveRepository.findByEmployeeId(employeeId);
    const requestsOfType = allRequests.filter((r) => r.leaveTypeId === leaveType.id);
    const today = todayUTC();
    const balance = leaveType.isPaid
      ? await this.computeBalanceForType(employee, leaveType, requestsOfType, today, startDate, settings)
      : this.emptyBalance();

    const checks = await this.runChecks(employee, startDate, endDate, days, balance, settings, leaveType);
    const failed = checks.find((c) => !c.ok);
    if (failed) {
      throw ApiError.badRequest(failed.body, { checks });
    }

    if (employee.managerId === null) {
      throw ApiError.badRequest("You don't have a manager assigned yet — contact HR.");
    }

    const expectedBackToWorkDate = toISODate(addDays(endDate, 1));

    const created = await this.leaveRepository.create({
      employeeId: employee.id,
      managerId: employee.managerId,
      leaveTypeId: leaveType.id,
      startDate: input.startDate,
      endDate: input.endDate,
      numberOfDays: days,
      reason: input.reason,
      attachmentName: input.attachmentName,
      attachmentUrl: input.attachmentUrl,
      expectedBackToWorkDate,
    });

    await this.auditRepository.record({
      employeeId: employee.id,
      performedByEmployeeId: employee.id,
      action: "leave_submitted",
      leaveRequestId: created.id,
      details: { startDate: input.startDate, endDate: input.endDate, days, leaveTypeId: leaveType.id },
    });

    const rangeLabel = `${formatHumanDate(startDate)} – ${formatHumanDate(endDate)}`;
    const typeLabel = leaveType.name.toLowerCase();
    await this.notify(
      employee.id,
      "leave_submitted",
      `Your ${typeLabel} request for ${rangeLabel} has been submitted.`,
      created.id,
    );
    await this.notify(
      employee.managerId,
      "leave_submitted",
      `${employee.fullName} submitted a ${typeLabel} request for ${rangeLabel}.`,
      created.id,
    );

    return created;
  }

  async getManagerQueue(managerId: number): Promise<ManagerQueueResult> {
    const leaveTypesMap = await this.getLeaveTypesMap();
    const pendingLeaveRequests = await this.leaveRepository.findPendingByManagerId(managerId);
    const pendingExtensions = await this.extensionRepository.findPendingByManagerId(managerId);
    const approvedRequests = await this.leaveRepository.findAll({ managerId, status: "approved" });
    const teamMembers = await this.employeeRepository.findByManagerId(managerId);
    const today = todayUTC();
    const weekAhead = addDays(today, 7);

    const peopleOutNextWeek = this.countDistinctEmployeesOverlapping(approvedRequests, today, weekAhead);

    const notReturnedAsExpected = approvedRequests.filter(
      (r) => r.actualBackToWorkDate === null && isBefore(parseISODate(r.expectedBackToWorkDate), today),
    ).length;

    const oldestSubmittedAt = [...pendingLeaveRequests, ...pendingExtensions]
      .map((r) => r.submittedAt)
      .sort()[0];
    const oldestInQueueDays = oldestSubmittedAt ? this.daysSince(oldestSubmittedAt, today) : 0;

    const queue: ManagerQueueItem[] = [];
    for (const request of pendingLeaveRequests) {
      const overview = await this.getOverview(request.employeeId);
      const teamOverlap = await this.getTeamOverlap(
        overview.employee,
        parseISODate(request.startDate),
        parseISODate(request.endDate),
      );
      queue.push({
        id: request.id,
        kind: "leave",
        employeeId: request.employeeId,
        employeeName: overview.employee.fullName,
        department: overview.employee.department,
        leaveTypeId: request.leaveTypeId,
        leaveTypeName: leaveTypesMap.get(request.leaveTypeId)?.name ?? "Unknown",
        startDate: request.startDate,
        endDate: request.endDate,
        numberOfDays: request.numberOfDays,
        reason: request.reason,
        attachmentName: request.attachmentName,
        attachmentUrl: request.attachmentUrl,
        backToWorkDate: request.expectedBackToWorkDate,
        submittedAt: request.submittedAt,
        balance: overview.balance,
        teamOverlap,
      });
    }
    for (const extension of pendingExtensions) {
      const overview = await this.getOverview(extension.employeeId);
      const teamOverlap = await this.getTeamOverlap(
        overview.employee,
        parseISODate(extension.startDate),
        parseISODate(extension.endDate),
      );
      queue.push({
        id: extension.id,
        kind: "extension",
        employeeId: extension.employeeId,
        employeeName: overview.employee.fullName,
        department: overview.employee.department,
        leaveTypeId: extension.leaveTypeId,
        leaveTypeName: leaveTypesMap.get(extension.leaveTypeId)?.name ?? "Unpaid Extension",
        startDate: extension.startDate,
        endDate: extension.endDate,
        numberOfDays: extension.numberOfDays,
        reason: extension.reason,
        attachmentName: extension.attachmentName,
        attachmentUrl: extension.attachmentUrl,
        backToWorkDate: toISODate(addDays(parseISODate(extension.endDate), 1)),
        submittedAt: extension.submittedAt,
        balance: overview.balance,
        teamOverlap,
      });
    }
    queue.sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

    return {
      stats: {
        awaitingYou: pendingLeaveRequests.length + pendingExtensions.length,
        oldestInQueueDays,
        peopleOutNextWeek,
        teamSize: teamMembers.length,
        notReturnedAsExpected,
      },
      queue,
    };
  }

  private excludeChainedPredecessors(requests: LeaveRequest[]): LeaveRequest[] {
    const startDatesByEmployee = new Map<number, Set<string>>();
    for (const r of requests) {
      const set = startDatesByEmployee.get(r.employeeId) ?? new Set<string>();
      set.add(r.startDate);
      startDatesByEmployee.set(r.employeeId, set);
    }
    return requests.filter((r) => {
      const nextDay = toISODate(addDays(parseISODate(r.endDate), 1));
      return !startDatesByEmployee.get(r.employeeId)?.has(nextDay);
    });
  }

  /** Counts distinct employees with a request overlapping the window, so one person with two approved requests still counts once. */
  private countDistinctEmployeesOverlapping(requests: LeaveRequest[], from: Date, to: Date): number {
    const employeeIds = new Set(
      requests
        .filter((r) => rangesOverlap(parseISODate(r.startDate), parseISODate(r.endDate), from, to))
        .map((r) => r.employeeId),
    );
    return employeeIds.size;
  }

  async getManagerOverview(managerId: number): Promise<ManagerOverview> {
    const leaveTypesMap = await this.getLeaveTypesMap();
    const teamMembers = await this.employeeRepository.findByManagerId(managerId);
    const employeeById = new Map(teamMembers.map((e) => [e.id, e]));
    const today = todayUTC();
    const weekAhead = addDays(today, 7);

    const [approvedRequests, approvedExtensions, pendingLeaveRequests, pendingExtensions] = await Promise.all([
      this.leaveRepository.findAll({ managerId, status: "approved" }),
      this.extensionRepository.findAll({ managerId, status: "approved" }),
      this.leaveRepository.findPendingByManagerId(managerId),
      this.extensionRepository.findPendingByManagerId(managerId),
    ]);

    const currentlyOnLeave: ManagerOnLeaveRow[] = [];
    for (const r of approvedRequests) {
      if (isAfter(parseISODate(r.startDate), today) || isBefore(parseISODate(r.endDate), today)) continue;
      currentlyOnLeave.push({
        employeeId: r.employeeId,
        name: employeeById.get(r.employeeId)?.fullName ?? "Unknown",
        department: employeeById.get(r.employeeId)?.department ?? null,
        leaveTypeId: r.leaveTypeId,
        leaveTypeName: leaveTypesMap.get(r.leaveTypeId)?.name ?? "Unknown",
        startDate: r.startDate,
        endDate: r.endDate,
        expectedBackToWorkDate: r.expectedBackToWorkDate,
      });
    }
    for (const e of approvedExtensions) {
      if (isAfter(parseISODate(e.startDate), today) || isBefore(parseISODate(e.endDate), today)) continue;
      currentlyOnLeave.push({
        employeeId: e.employeeId,
        name: employeeById.get(e.employeeId)?.fullName ?? "Unknown",
        department: employeeById.get(e.employeeId)?.department ?? null,
        leaveTypeId: e.leaveTypeId,
        leaveTypeName: leaveTypesMap.get(e.leaveTypeId)?.name ?? "Unpaid Extension",
        startDate: e.startDate,
        endDate: e.endDate,
        expectedBackToWorkDate: toISODate(addDays(parseISODate(e.endDate), 1)),
      });
    }

    const chainTailRequests = this.excludeChainedPredecessors(approvedRequests);

    const backToWorkWatchlist: AdminBackToWorkRow[] = chainTailRequests
      .filter((r) => {
        const expected = parseISODate(r.expectedBackToWorkDate);
        const isOverdue = r.actualBackToWorkDate === null && isBefore(expected, today);
        const isWithinWindow = !isAfter(expected, weekAhead);
        return isOverdue || isWithinWindow;
      })
      .map((r) => {
        const expected = parseISODate(r.expectedBackToWorkDate);
        let status: AdminBackToWorkRow["status"] = "Upcoming";
        if (r.actualBackToWorkDate) status = "Returned";
        else if (isBefore(expected, today)) status = "Overdue";
        return {
          employeeId: r.employeeId,
          name: employeeById.get(r.employeeId)?.fullName ?? "Unknown",
          department: employeeById.get(r.employeeId)?.department ?? null,
          expectedBackToWorkDate: r.expectedBackToWorkDate,
          actualBackToWorkDate: r.actualBackToWorkDate,
          status,
        };
      })
      .sort((a, b) => a.expectedBackToWorkDate.localeCompare(b.expectedBackToWorkDate));

    const peopleOutNextWeek = this.countDistinctEmployeesOverlapping(approvedRequests, today, weekAhead);
    const notReturnedAsExpected = chainTailRequests.filter(
      (r) => r.actualBackToWorkDate === null && isBefore(parseISODate(r.expectedBackToWorkDate), today),
    ).length;

    return {
      stats: {
        teamSize: teamMembers.length,
        currentlyOnLeave: currentlyOnLeave.length,
        pendingApprovals: pendingLeaveRequests.length + pendingExtensions.length,
        peopleOutNextWeek,
        notReturnedAsExpected,
      },
      currentlyOnLeave,
      backToWorkWatchlist,
    };
  }

  async decide(
    managerId: number,
    leaveRequestId: number,
    decision: "approved" | "rejected",
  ): Promise<LeaveRequest> {
    const request = await this.requireOwnedRequest(managerId, leaveRequestId);
    if (request.status !== "pending") {
      throw ApiError.badRequest("This request has already been decided.");
    }

    const updated = await this.leaveRepository.updateStatus(leaveRequestId, decision);
    const action = decision === "approved" ? "leave_approved" : "leave_rejected";
    await this.auditRepository.record({
      employeeId: request.employeeId,
      performedByEmployeeId: managerId,
      action,
      leaveRequestId,
    });
    await this.notify(
      request.employeeId,
      action,
      `Your annual leave request for ${formatHumanDate(parseISODate(request.startDate))} – ${formatHumanDate(parseISODate(request.endDate))} was ${decision}.`,
      leaveRequestId,
    );
    return updated;
  }

  async undoDecision(managerId: number, leaveRequestId: number): Promise<LeaveRequest> {
    const request = await this.requireOwnedRequest(managerId, leaveRequestId);
    if (request.status === "pending") {
      throw ApiError.badRequest("This request is already pending.");
    }

    const updated = await this.leaveRepository.updateStatus(leaveRequestId, "pending");
    await this.auditRepository.record({
      employeeId: request.employeeId,
      performedByEmployeeId: managerId,
      action: "leave_decision_undone",
      leaveRequestId,
    });
    return updated;
  }

  private async requireOwnedRequest(managerId: number, leaveRequestId: number): Promise<LeaveRequest> {
    const request = await this.leaveRepository.findById(leaveRequestId);
    if (!request) {
      throw ApiError.notFound("Leave request not found");
    }
    if (request.managerId !== managerId) {
      throw ApiError.forbidden("You can only act on your own team's requests.");
    }
    return request;
  }

  private async findCurrentApprovedLeave(employeeId: number, reference: Date): Promise<LeaveRequest | null> {
    const allRequests = await this.leaveRepository.findByEmployeeId(employeeId);
    return (
      allRequests.find(
        (r) =>
          r.status === "approved" &&
          !isAfter(parseISODate(r.startDate), reference) &&
          !isBefore(parseISODate(r.endDate), reference),
      ) ?? null
    );
  }

  async precheckExtension(
    employeeId: number,
    startDateInput: string,
    endDateInput: string,
  ): Promise<ExtensionPrecheckResult> {
    const startDate = parseISODate(startDateInput);
    const endDate = parseISODate(endDateInput);
    if (isAfter(startDate, endDate)) {
      throw ApiError.badRequest("End date must be on or after the start date.");
    }
    const days = daysBetweenInclusive(startDate, endDate);
    const today = todayUTC();

    const currentLeave = await this.findCurrentApprovedLeave(employeeId, today);
    const linkedExtensions = currentLeave
      ? await this.extensionRepository.findByLeaveRequestId(currentLeave.id)
      : [];
    const hasPendingExtension = linkedExtensions.some((e) => e.status === "pending");
    const approvedExtensions = linkedExtensions.filter((e) => e.status === "approved");

    const anchorEndDate = currentLeave
      ? approvedExtensions.reduce(
          (latest, e) => (e.endDate > latest ? e.endDate : latest),
          currentLeave.endDate,
        )
      : null;

    const onLeaveCheck: ExtensionCheckItem = currentLeave
      ? {
          key: "onLeave",
          ok: true,
          title: "Currently on annual leave",
          body: `Extending your leave that runs until ${formatHumanDate(parseISODate(currentLeave.endDate))}.`,
        }
      : {
          key: "onLeave",
          ok: false,
          title: "Not currently on leave",
          body: "You can only request an extension while on approved annual leave.",
        };

    let contiguousCheck: ExtensionCheckItem;
    if (currentLeave && anchorEndDate) {
      const expectedStart = addDays(parseISODate(anchorEndDate), 1);
      contiguousCheck =
        toISODate(startDate) === toISODate(expectedStart)
          ? {
              key: "contiguous",
              ok: true,
              title: "Starts right after your leave",
              body: `Continues from ${formatHumanDate(expectedStart)}.`,
            }
          : {
              key: "contiguous",
              ok: false,
              title: "Must start the day your leave ends",
              body: `Extension should start ${formatHumanDate(expectedStart)} to continue without a gap.`,
            };
    } else {
      contiguousCheck = {
        key: "contiguous",
        ok: false,
        title: "Must start the day your leave ends",
        body: "Apply while on approved leave to see the right start date.",
      };
    }

    let overlapCheck: ExtensionCheckItem;
    const overlappingLeave = await this.leaveRepository.findOverlapping(
      employeeId,
      toISODate(startDate),
      toISODate(endDate),
    );

    if (hasPendingExtension) {
      overlapCheck = {
        key: "overlap",
        ok: false,
        title: "Extension already pending",
        body: "Wait for your current extension request to be decided before requesting another.",
      };
    } else if (overlappingLeave.length > 0) {
      overlapCheck = {
        key: "overlap",
        ok: false,
        title: "Overlaps an existing request",
        body: `Clashes with your ${overlappingLeave[0].status} request, ${formatHumanDate(parseISODate(overlappingLeave[0].startDate))} – ${formatHumanDate(parseISODate(overlappingLeave[0].endDate))}.`,
      };
    } else {
      overlapCheck = {
        key: "overlap",
        ok: true,
        title: "No conflicts",
        body: "This extension doesn't clash with anything else.",
      };
    }

    const checks = [onLeaveCheck, contiguousCheck, overlapCheck];
    return {
      days,
      checks,
      canSubmit: checks.every((c) => c.ok),
      currentLeave,
      newBackToWorkDate: toISODate(addDays(endDate, 1)),
    };
  }

  async applyExtension(employeeId: number, input: ApplyExtensionInput): Promise<LeaveExtension> {
    const employee = await this.requireEmployee(employeeId);
    const precheck = await this.precheckExtension(employeeId, input.startDate, input.endDate);

    if (!precheck.canSubmit || !precheck.currentLeave) {
      const failed = precheck.checks.find((c) => !c.ok);
      throw ApiError.badRequest(failed?.body ?? "This extension can't be submitted.", {
        checks: precheck.checks,
      });
    }
    if (employee.managerId === null) {
      throw ApiError.badRequest("You don't have a manager assigned yet — contact HR.");
    }

    const unpaidExtensionType = await this.getUnpaidExtensionType();
    const created = await this.extensionRepository.create({
      leaveRequestId: precheck.currentLeave.id,
      employeeId: employee.id,
      managerId: employee.managerId,
      leaveTypeId: unpaidExtensionType.id,
      startDate: input.startDate,
      endDate: input.endDate,
      numberOfDays: precheck.days,
      reason: input.reason,
      attachmentName: input.attachmentName,
      attachmentUrl: input.attachmentUrl,
    });

    await this.auditRepository.record({
      employeeId: employee.id,
      performedByEmployeeId: employee.id,
      action: "extension_submitted",
      extensionId: created.id,
      leaveRequestId: created.leaveRequestId,
      details: { startDate: input.startDate, endDate: input.endDate, days: precheck.days },
    });

    await this.notify(
      employee.managerId,
      "extension_submitted",
      `${employee.fullName} requested an unpaid extension for ${formatHumanDate(parseISODate(input.startDate))} – ${formatHumanDate(parseISODate(input.endDate))}.`,
      created.leaveRequestId,
      created.id,
    );

    return created;
  }

  async decideExtension(
    managerId: number,
    extensionId: number,
    decision: "approved" | "rejected",
  ): Promise<LeaveExtension> {
    const extension = await this.requireOwnedExtension(managerId, extensionId);
    if (extension.status !== "pending") {
      throw ApiError.badRequest("This extension has already been decided.");
    }

    const updated = await this.extensionRepository.updateStatus(extensionId, decision);

    if (decision === "approved") {
      const newBackToWork = toISODate(addDays(parseISODate(extension.endDate), 1));
      await this.leaveRepository.updateExpectedBackToWork(extension.leaveRequestId, newBackToWork);
    }

    const action = decision === "approved" ? "extension_approved" : "extension_rejected";
    await this.auditRepository.record({
      employeeId: extension.employeeId,
      performedByEmployeeId: managerId,
      action,
      extensionId,
      leaveRequestId: extension.leaveRequestId,
    });
    await this.notify(
      extension.employeeId,
      action,
      `Your unpaid extension request for ${formatHumanDate(parseISODate(extension.startDate))} – ${formatHumanDate(parseISODate(extension.endDate))} was ${decision}.`,
      extension.leaveRequestId,
      extensionId,
    );

    return updated;
  }

  async undoExtensionDecision(managerId: number, extensionId: number): Promise<LeaveExtension> {
    const extension = await this.requireOwnedExtension(managerId, extensionId);
    if (extension.status === "pending") {
      throw ApiError.badRequest("This extension is already pending.");
    }

    const wasApproved = extension.status === "approved";
    const updated = await this.extensionRepository.updateStatus(extensionId, "pending");

    if (wasApproved) {
      await this.leaveRepository.updateExpectedBackToWork(extension.leaveRequestId, extension.startDate);
    }

    await this.auditRepository.record({
      employeeId: extension.employeeId,
      performedByEmployeeId: managerId,
      action: "extension_decision_undone",
      extensionId,
      leaveRequestId: extension.leaveRequestId,
    });

    return updated;
  }

  async getTeamHistory(managerId: number): Promise<TeamHistoryRow[]> {
    const manager = await this.requireEmployee(managerId);
    const leaveTypesMap = await this.getLeaveTypesMap();
    const teamMembers = await this.employeeRepository.findByManagerId(managerId);

    const rows: TeamHistoryRow[] = [];
    for (const member of teamMembers) {
      const requests = await this.leaveRepository.findByEmployeeId(member.id);
      const extensions = await this.extensionRepository.findByEmployeeId(member.id);

      for (const r of requests) {
        rows.push({
          employeeId: member.id,
          employeeName: member.fullName,
          department: member.department,
          kind: "leave",
          leaveTypeId: r.leaveTypeId,
          leaveTypeName: leaveTypesMap.get(r.leaveTypeId)?.name ?? "Unknown",
          startDate: r.startDate,
          endDate: r.endDate,
          numberOfDays: r.numberOfDays,
          status: r.status,
          decidedByName: r.decidedAt ? manager.fullName : null,
          submittedAt: r.submittedAt,
        });
      }
      for (const e of extensions) {
        rows.push({
          employeeId: member.id,
          employeeName: member.fullName,
          department: member.department,
          kind: "extension",
          leaveTypeId: e.leaveTypeId,
          leaveTypeName: leaveTypesMap.get(e.leaveTypeId)?.name ?? "Unpaid Extension",
          startDate: e.startDate,
          endDate: e.endDate,
          numberOfDays: e.numberOfDays,
          status: e.status,
          decidedByName: e.decidedAt ? manager.fullName : null,
          submittedAt: e.submittedAt,
        });
      }
    }

    return rows.sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  async getTeamCalendar(monthInput?: string, department?: string): Promise<TeamCalendarResult> {
    const employees = await this.employeeRepository.findAll({ isActive: true, department });
    return this.buildCalendarResult(employees, monthInput);
  }

  async getAdminCalendar(monthInput?: string, department?: string): Promise<TeamCalendarResult> {
    const employees = await this.employeeRepository.findAll({ isActive: true, department });
    return this.buildCalendarResult(employees.filter((e) => e.role !== "manager"), monthInput);
  }

  private resolveCalendarMonth(monthInput?: string): { year: number; month: number } {
    const today = todayUTC();
    let year = today.getUTCFullYear();
    let month = today.getUTCMonth() + 1;
    if (monthInput) {
      const match = /^(\d{4})-(\d{2})$/.exec(monthInput);
      if (match) {
        year = Number(match[1]);
        month = Number(match[2]);
      }
    }
    return { year, month };
  }

  private async buildCalendarResult(members: Employee[], monthInput?: string): Promise<TeamCalendarResult> {
    const { year, month } = this.resolveCalendarMonth(monthInput);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 0));

    const people: TeamCalendarPerson[] = [];
    for (const member of members) {
      const bars = await this.buildCalendarBars(member.id, monthStart, monthEnd);
      people.push({ employeeId: member.id, name: member.fullName, department: member.department, bars });
    }

    return { month: `${year}-${String(month).padStart(2, "0")}`, people };
  }

  private async buildCalendarBars(
    employeeId: number,
    monthStart: Date,
    monthEnd: Date,
  ): Promise<TeamCalendarBar[]> {
    const leaveTypesMap = await this.getLeaveTypesMap();
    const requests = await this.leaveRepository.findByEmployeeId(employeeId);
    const extensions = await this.extensionRepository.findByEmployeeId(employeeId);
    const bars: TeamCalendarBar[] = [];

    for (const r of requests) {
      if (r.status !== "pending" && r.status !== "approved") continue;
      if (!rangesOverlap(parseISODate(r.startDate), parseISODate(r.endDate), monthStart, monthEnd)) {
        continue;
      }
      bars.push({
        startDate: r.startDate,
        endDate: r.endDate,
        leaveTypeId: r.leaveTypeId,
        leaveTypeName: leaveTypesMap.get(r.leaveTypeId)?.name ?? "Unknown",
        status: r.status,
      });
    }
    for (const e of extensions) {
      if (e.status !== "pending" && e.status !== "approved") continue;
      if (!rangesOverlap(parseISODate(e.startDate), parseISODate(e.endDate), monthStart, monthEnd)) {
        continue;
      }
      bars.push({
        startDate: e.startDate,
        endDate: e.endDate,
        leaveTypeId: e.leaveTypeId,
        leaveTypeName: leaveTypesMap.get(e.leaveTypeId)?.name ?? "Unpaid Extension",
        status: e.status,
      });
    }
    return bars;
  }

  private async requireOwnedExtension(managerId: number, extensionId: number): Promise<LeaveExtension> {
    const extension = await this.extensionRepository.findById(extensionId);
    if (!extension) {
      throw ApiError.notFound("Extension not found");
    }
    if (extension.managerId !== managerId) {
      throw ApiError.forbidden("You can only act on your own team's requests.");
    }
    return extension;
  }

  private daysSince(iso: string, reference: Date): number {
    const msPerDay = 24 * 60 * 60 * 1000;
    return Math.max(0, Math.round((reference.getTime() - parseISODate(iso).getTime()) / msPerDay));
  }

  async getAdminOverview(): Promise<AdminOverview> {
    const settings = await this.settingsRepository.get();
    const allActiveEmployees = await this.employeeRepository.findAll({ isActive: true });
    const employees = allActiveEmployees.filter((e) => e.role !== "manager");
    const allRequests = await this.leaveRepository.findAll({});
    const approvedRequests = allRequests.filter((r) => r.status === "approved");
    const pendingRequests = allRequests.filter((r) => r.status === "pending");

    const today = todayUTC();
    const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    const watchlistWindowEnd = addDays(today, settings.backToWorkWatchlistDays);
    const eligibilityWindowEnd = addDays(today, settings.approachingEligibilityDays);

    const employeeById = new Map(employees.map((e) => [e.id, e]));
    const departmentOf = (employeeId: number) => employeeById.get(employeeId)?.department ?? "Unassigned";
    const departments = new Set(employees.map((e) => e.department ?? "Unassigned"));

    const onLeaveEmployeeIds = new Set(
      approvedRequests
        .filter(
          (r) => !isAfter(parseISODate(r.startDate), today) && !isBefore(parseISODate(r.endDate), today),
        )
        .map((r) => r.employeeId),
    );

    const upcomingThisMonth = [...approvedRequests, ...pendingRequests].filter((r) => {
      const start = parseISODate(r.startDate);
      return isAfter(start, today) && !isAfter(start, monthEnd);
    }).length;

    const chainTailRequests = this.excludeChainedPredecessors(approvedRequests);

    const notReturned = chainTailRequests.filter(
      (r) => r.actualBackToWorkDate === null && isBefore(parseISODate(r.expectedBackToWorkDate), today),
    );

    const overduePending = pendingRequests.filter(
      (r) => this.daysSince(r.submittedAt, today) > settings.pendingApprovalAlertDays,
    );

    const backToWorkWatchlist: AdminBackToWorkRow[] = chainTailRequests
      .filter((r) => {
        const expected = parseISODate(r.expectedBackToWorkDate);
        const isOverdue = r.actualBackToWorkDate === null && isBefore(expected, today);
        const isWithinWindow = !isAfter(expected, watchlistWindowEnd);
        return isOverdue || isWithinWindow;
      })
      .map((r) => {
        const expected = parseISODate(r.expectedBackToWorkDate);
        let status: AdminBackToWorkRow["status"] = "Upcoming";
        if (r.actualBackToWorkDate) status = "Returned";
        else if (isBefore(expected, today)) status = "Overdue";
        return {
          employeeId: r.employeeId,
          name: employeeById.get(r.employeeId)?.fullName ?? "Unknown",
          department: departmentOf(r.employeeId),
          expectedBackToWorkDate: r.expectedBackToWorkDate,
          actualBackToWorkDate: r.actualBackToWorkDate,
          status,
        };
      })
      .sort((a, b) => a.expectedBackToWorkDate.localeCompare(b.expectedBackToWorkDate));

    const msPerDay = 24 * 60 * 60 * 1000;
    const approachingEligibility: AdminEligibilityCandidate[] = employees
      .map((employee) => ({ employee, eligibleFrom: this.getEligibleFrom(employee, settings) }))
      .filter(({ eligibleFrom }) => !isBefore(eligibleFrom, today) && !isAfter(eligibleFrom, eligibilityWindowEnd))
      .map(({ employee, eligibleFrom }) => ({
        employeeId: employee.id,
        name: employee.fullName,
        joiningDate: employee.joiningDate,
        daysUntilEligible: Math.round((eligibleFrom.getTime() - today.getTime()) / msPerDay),
      }))
      .sort((a, b) => a.daysUntilEligible - b.daysUntilEligible);

    const departmentLoad: AdminDepartmentLoad[] = [...departments]
      .map((department) => {
        const deptEmployees = employees.filter((e) => (e.department ?? "Unassigned") === department);
        const onLeave = deptEmployees.filter((e) => onLeaveEmployeeIds.has(e.id)).length;
        return { department, onLeave, headcount: deptEmployees.length };
      })
      .sort((a, b) => b.headcount - a.headcount);

    return {
      stats: {
        totalEmployees: employees.length,
        departmentCount: departments.size,
        currentlyOnLeave: onLeaveEmployeeIds.size,
        upcomingThisMonth,
        notReturnedAsExpected: notReturned.length,
        pendingApprovals: pendingRequests.length,
        pendingOver3DaysOld: overduePending.length,
      },
      backToWorkWatchlist,
      approachingEligibility,
      departmentLoad,
    };
  }

  async getAdminLeaveRecords(filter: AdminLeaveRecordFilter = {}): Promise<AdminLeaveRecordRow[]> {
    const leaveTypesMap = await this.getLeaveTypesMap();
    const repoFilter = {
      employeeId: filter.employeeId,
      managerId: filter.managerId,
      status: filter.status,
      from: filter.from,
      to: filter.to,
    };

    const [requests, extensions, employees] = await Promise.all([
      filter.kind === "extension" ? Promise.resolve([]) : this.leaveRepository.findAll(repoFilter),
      filter.kind === "leave" ? Promise.resolve([]) : this.extensionRepository.findAll(repoFilter),
      this.employeeRepository.findAll({}),
    ]);
    const employeeById = new Map(employees.map((e) => [e.id, e]));

    const rows: AdminLeaveRecordRow[] = [
      ...requests.map((r) => ({
        id: r.id,
        employeeId: r.employeeId,
        employeeName: employeeById.get(r.employeeId)?.fullName ?? "Unknown",
        department: employeeById.get(r.employeeId)?.department ?? null,
        kind: "leave" as const,
        leaveTypeId: r.leaveTypeId,
        leaveTypeName: leaveTypesMap.get(r.leaveTypeId)?.name ?? "Unknown",
        startDate: r.startDate,
        endDate: r.endDate,
        numberOfDays: r.numberOfDays,
        reason: r.reason,
        status: r.status,
        expectedBackToWorkDate: r.expectedBackToWorkDate,
        actualBackToWorkDate: r.actualBackToWorkDate,
        submittedAt: r.submittedAt,
      })),
      ...extensions.map((e) => ({
        id: e.id,
        employeeId: e.employeeId,
        employeeName: employeeById.get(e.employeeId)?.fullName ?? "Unknown",
        department: employeeById.get(e.employeeId)?.department ?? null,
        kind: "extension" as const,
        leaveTypeId: e.leaveTypeId,
        leaveTypeName: leaveTypesMap.get(e.leaveTypeId)?.name ?? "Unpaid Extension",
        startDate: e.startDate,
        endDate: e.endDate,
        numberOfDays: e.numberOfDays,
        reason: e.reason,
        status: e.status,
        expectedBackToWorkDate: null,
        actualBackToWorkDate: null,
        submittedAt: e.submittedAt,
      })),
    ];

    return rows
      .filter((r) => !filter.department || r.department === filter.department)
      .filter((r) => filter.leaveTypeId === undefined || r.leaveTypeId === filter.leaveTypeId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  async correctLeaveRecord(
    adminId: number,
    leaveRequestId: number,
    input: CorrectLeaveRecordInput,
  ): Promise<LeaveRequest> {
    const before = await this.leaveRepository.findById(leaveRequestId);
    if (!before) {
      throw ApiError.notFound("Leave request not found");
    }
    if (input.status === "approved" || input.status === "rejected") {
      throw ApiError.forbidden(
        "Admin/HR cannot approve or reject leave — only the assigned manager can decide a request.",
      );
    }

    const startDate = input.startDate ?? before.startDate;
    const endDate = input.endDate ?? before.endDate;
    if (isAfter(parseISODate(startDate), parseISODate(endDate))) {
      throw ApiError.badRequest("End date must be on or after the start date.");
    }
    const numberOfDays =
      input.startDate !== undefined || input.endDate !== undefined
        ? daysBetweenInclusive(parseISODate(startDate), parseISODate(endDate))
        : undefined;

    let updated = await this.leaveRepository.updateFields(leaveRequestId, {
      startDate: input.startDate,
      endDate: input.endDate,
      numberOfDays,
      reason: input.reason,
      status: input.status,
    });

    if (input.endDate !== undefined) {
      const linkedExtensions = await this.extensionRepository.findByLeaveRequestId(leaveRequestId);
      const hasApprovedExtension = linkedExtensions.some((e) => e.status === "approved");
      if (!hasApprovedExtension) {
        const recalculatedBackToWork = toISODate(addDays(parseISODate(endDate), 1));
        if (recalculatedBackToWork !== before.expectedBackToWorkDate) {
          updated = await this.leaveRepository.updateExpectedBackToWork(leaveRequestId, recalculatedBackToWork);
        }
      }
    }

    await this.auditRepository.record({
      employeeId: before.employeeId,
      performedByEmployeeId: adminId,
      action: "leave_record_corrected",
      leaveRequestId,
      details: {
        before: {
          startDate: before.startDate,
          endDate: before.endDate,
          numberOfDays: before.numberOfDays,
          reason: before.reason,
          status: before.status,
          expectedBackToWorkDate: before.expectedBackToWorkDate,
        },
        after: {
          startDate: updated.startDate,
          endDate: updated.endDate,
          numberOfDays: updated.numberOfDays,
          reason: updated.reason,
          status: updated.status,
          expectedBackToWorkDate: updated.expectedBackToWorkDate,
        },
      },
    });

    return updated;
  }

  async recordActualBackToWork(
    adminId: number,
    leaveRequestId: number,
    actualBackToWorkDate: string | null,
  ): Promise<LeaveRequest> {
    const request = await this.leaveRepository.findById(leaveRequestId);
    if (!request) {
      throw ApiError.notFound("Leave request not found");
    }
    if (request.status !== "approved") {
      throw ApiError.badRequest("Only approved leave can be marked as returned.");
    }

    const updated = await this.leaveRepository.recordActualBackToWork(leaveRequestId, actualBackToWorkDate);

    await this.auditRepository.record({
      employeeId: request.employeeId,
      performedByEmployeeId: adminId,
      action: "back_to_work_recorded",
      leaveRequestId,
      details: { previous: request.actualBackToWorkDate, actualBackToWorkDate },
    });

    await this.rebuildCycleChain(request.employeeId);

    return updated;
  }

  async getReports(year?: number, department?: string): Promise<AdminReportsResult> {
    const today = todayUTC();
    const targetYear = year ?? today.getUTCFullYear();
    const priorYear = targetYear - 1;

    const rangeStart = `${targetYear}-01-01`;
    const rangeEnd = `${targetYear}-12-31`;
    const priorRangeStart = `${priorYear}-01-01`;
    const priorRangeEnd = `${priorYear}-12-31`;
    const cycleLabel = `Cycle ${targetYear}`;

    const [employees, requestsInRangeAll, priorRequestsAll, approvedExtensions, pendingExtensions, allPendingRequests, allApprovedRequests, leaveTypes] =
      await Promise.all([
        this.employeeRepository.findAll({}),
        this.leaveRepository.findAll({ status: "approved", from: rangeStart, to: rangeEnd }),
        this.leaveRepository.findAll({ status: "approved", from: priorRangeStart, to: priorRangeEnd }),
        this.extensionRepository.findAll({ status: "approved" }),
        this.extensionRepository.findAll({ status: "pending" }),
        this.leaveRepository.findAll({ status: "pending" }),
        this.leaveRepository.findAll({ status: "approved" }),
        this.leaveTypeRepository.findAll(),
      ]);
    const leaveTypesMap = new Map(leaveTypes.map((t) => [t.id, t]));

    const employeeById = new Map(employees.map((e) => [e.id, e]));
    const departmentOf = (employeeId: number) => employeeById.get(employeeId)?.department ?? "Unassigned";
    const inDept = (employeeId: number) => !department || departmentOf(employeeId) === department;
    const trackedEmployees = employees.filter((e) => e.role !== "manager");

    const requestsInDept = requestsInRangeAll.filter((r) => inDept(r.employeeId));
    const priorRequestsInDept = priorRequestsAll.filter((r) => inDept(r.employeeId));
    const extensionsInRangeAll = approvedExtensions.filter(
      (e) => e.startDate >= rangeStart && e.startDate <= rangeEnd,
    );
    const extensionsInDept = extensionsInRangeAll.filter((e) => inDept(e.employeeId));
    const priorExtensionsInDept = approvedExtensions.filter(
      (e) => e.startDate >= priorRangeStart && e.startDate <= priorRangeEnd && inDept(e.employeeId),
    );

    const standaloneLeaveDays = requestsInDept.reduce((sum, r) => sum + r.numberOfDays, 0);
    const unpaidDays = extensionsInDept.reduce((sum, e) => sum + e.numberOfDays, 0);
    const daysTakenYtd = standaloneLeaveDays + unpaidDays;
    const daysTakenPriorPeriod =
      priorRequestsInDept.reduce((sum, r) => sum + r.numberOfDays, 0) +
      priorExtensionsInDept.reduce((sum, e) => sum + e.numberOfDays, 0);
    const deltaPercent =
      daysTakenPriorPeriod === 0
        ? 0
        : Math.round(((daysTakenYtd - daysTakenPriorPeriod) / daysTakenPriorPeriod) * 100);

    const relevantEmployees = trackedEmployees.filter((e) => e.isActive && inDept(e.id));
    const avgPerEmployee =
      relevantEmployees.length === 0 ? 0 : Math.round((daysTakenYtd / relevantEmployees.length) * 10) / 10;
    const avgEntitlement =
      relevantEmployees.length === 0
        ? 0
        : Math.round(
            relevantEmployees.reduce((sum, e) => sum + e.annualEntitlementDays, 0) / relevantEmployees.length,
          );

    const todayISO = toISODate(today);
    const overdue = allApprovedRequests.filter(
      (r) => !r.actualBackToWorkDate && r.expectedBackToWorkDate < todayISO && inDept(r.employeeId),
    );
    const overdueNames = overdue.map((r) => employeeById.get(r.employeeId)?.fullName ?? "Unknown");
    const unpaidPendingCount = pendingExtensions.filter((e) => inDept(e.employeeId)).length;

    const daysByLeaveType = new Map<number, number>();
    for (const r of requestsInDept) {
      daysByLeaveType.set(r.leaveTypeId, (daysByLeaveType.get(r.leaveTypeId) ?? 0) + r.numberOfDays);
    }
    const unpaidExtensionType = leaveTypes.find((t) => t.code === "unpaid_extension");
    if (unpaidExtensionType && unpaidDays > 0) {
      daysByLeaveType.set(
        unpaidExtensionType.id,
        (daysByLeaveType.get(unpaidExtensionType.id) ?? 0) + unpaidDays,
      );
    }
    const totalTypedDays = [...daysByLeaveType.values()].reduce((sum, d) => sum + d, 0);
    const pct = (days: number) => (totalTypedDays === 0 ? 0 : Math.round((days / totalTypedDays) * 1000) / 10);
    const leaveTypeSplit: AdminReportsResult["leaveTypeSplit"] = [...daysByLeaveType.entries()]
      .map(([leaveTypeId, days]) => ({
        leaveTypeId,
        leaveTypeName: leaveTypesMap.get(leaveTypeId)?.name ?? "Unknown",
        days,
        percent: pct(days),
      }))
      .sort((a, b) => b.days - a.days);

    const bucketStarts = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(targetYear, i, 1)));
    const bucketIndexByKey = new Map(bucketStarts.map((d, i) => [toISODate(d).slice(0, 7), i]));
    const daysByBucket = new Array<number>(12).fill(0);
    for (const r of requestsInDept) {
      const idx = bucketIndexByKey.get(r.startDate.slice(0, 7));
      if (idx !== undefined) daysByBucket[idx] += r.numberOfDays;
    }
    for (const e of extensionsInDept) {
      const idx = bucketIndexByKey.get(e.startDate.slice(0, 7));
      if (idx !== undefined) daysByBucket[idx] += e.numberOfDays;
    }
    const maxBucketDays = Math.max(1, ...daysByBucket);
    const monthly: AdminReportsResult["monthly"] = bucketStarts.map((d, i) => ({
      label: MONTH_ABBREVIATIONS[d.getUTCMonth()],
      days: daysByBucket[i],
      heightPercent: Math.round((daysByBucket[i] / maxBucketDays) * 100),
    }));

    const departmentNames = [...new Set(trackedEmployees.map((e) => e.department ?? "Unassigned"))].sort();
    const departmentTable: AdminReportsResult["departmentTable"] = departmentNames
      .map((name) => {
        const deptEmployees = trackedEmployees.filter((e) => (e.department ?? "Unassigned") === name && e.isActive);
        const headcount = deptEmployees.length;
        const entitlementTotal = deptEmployees.reduce((sum, e) => sum + e.annualEntitlementDays, 0);
        const daysTaken =
          requestsInRangeAll.filter((r) => departmentOf(r.employeeId) === name).reduce((sum, r) => sum + r.numberOfDays, 0) +
          extensionsInRangeAll.filter((e) => departmentOf(e.employeeId) === name).reduce((sum, e) => sum + e.numberOfDays, 0);
        const pending =
          allPendingRequests.filter((r) => departmentOf(r.employeeId) === name).length +
          pendingExtensions.filter((e) => departmentOf(e.employeeId) === name).length;
        const liabilityDays = Math.max(0, entitlementTotal - daysTaken);
        const utilizationPercent = entitlementTotal === 0 ? 0 : Math.round((daysTaken / entitlementTotal) * 100);
        return { name, headcount, daysTaken, utilizationPercent, pending, liabilityDays };
      })
      .sort((a, b) => b.liabilityDays - a.liabilityDays);

    const totalLiabilityDays = departmentTable.reduce((sum, d) => sum + d.liabilityDays, 0);

    return {
      cycleLabel,
      year: targetYear,
      availableYears: [today.getUTCFullYear(), today.getUTCFullYear() - 1],
      department: department ?? null,
      departments: departmentNames,
      stats: {
        daysTakenYtd,
        daysTakenPriorPeriod,
        deltaPercent,
        avgPerEmployee,
        avgEntitlement,
        overdueCount: overdue.length,
        overdueNames,
        unpaidDays,
        unpaidPendingCount,
        unpaidApprovedCount: extensionsInDept.length,
      },
      monthly,
      leaveTypeSplit,
      departmentTable,
      totalLiabilityDays,
    };
  }

  async getAuditHistory(filter: AuditLogFilter = {}): Promise<AuditHistoryRow[]> {
    const [entries, employees] = await Promise.all([
      this.auditRepository.findAll(filter),
      this.employeeRepository.findAll({}),
    ]);
    const employeeById = new Map(employees.map((e) => [e.id, e]));

    const leaveRequestIds = [
      ...new Set(entries.map((e) => e.leaveRequestId).filter((id): id is number => id !== null)),
    ];
    const leaveRequests = await Promise.all(leaveRequestIds.map((id) => this.leaveRepository.findById(id)));
    const leaveById = new Map(
      leaveRequests.filter((r): r is LeaveRequest => r !== null).map((r) => [r.id, r]),
    );

    return entries
      .map((entry) => {
        const leaveRequest = entry.leaveRequestId !== null ? leaveById.get(entry.leaveRequestId) ?? null : null;
        return {
          id: entry.id,
          employeeName: employeeById.get(entry.employeeId)?.fullName ?? "Unknown",
          performedByName: employeeById.get(entry.performedByEmployeeId)?.fullName ?? "Unknown",
          performedByRole: employeeById.get(entry.performedByEmployeeId)?.role ?? "employee",
          action: entry.action,
          actionLabel: AUDIT_ACTION_LABELS[entry.action] ?? entry.action,
          leaveRequestId: entry.leaveRequestId,
          leaveRequestSummary: leaveRequest
            ? `${formatHumanDate(parseISODate(leaveRequest.startDate))} – ${formatHumanDate(parseISODate(leaveRequest.endDate))}`
            : null,
          performedAt: entry.performedAt,
        };
      })
      .sort((a, b) => b.performedAt.localeCompare(a.performedAt));
  }

  private async notify(
    employeeId: number,
    action: string,
    message: string,
    leaveRequestId: number | null = null,
    extensionId: number | null = null,
  ): Promise<void> {
    await this.notificationRepository.create({ employeeId, action, message, leaveRequestId, extensionId });
  }

  async getNotifications(employeeId: number): Promise<Notification[]> {
    return this.notificationRepository.findByEmployeeId(employeeId);
  }

  async getUnreadNotificationCount(employeeId: number): Promise<number> {
    return this.notificationRepository.countUnread(employeeId);
  }

  async markNotificationRead(employeeId: number, notificationId: number): Promise<Notification> {
    const updated = await this.notificationRepository.markRead(notificationId, employeeId);
    if (!updated) {
      throw ApiError.notFound("Notification not found");
    }
    return updated;
  }

  async markAllNotificationsRead(employeeId: number): Promise<void> {
    await this.notificationRepository.markAllRead(employeeId);
  }

  async dismissNotification(employeeId: number, notificationId: number): Promise<void> {
    await this.notificationRepository.delete(notificationId, employeeId);
  }

  async getSettings(): Promise<CompanySettings> {
    return this.settingsRepository.get();
  }

  async updateSettings(adminId: number, input: UpdateSettingsInput): Promise<CompanySettings> {
    this.validateSettingsInput(input);

    const before = await this.settingsRepository.get();
    const after = await this.settingsRepository.update(input);

    await this.auditRepository.record({
      employeeId: adminId,
      performedByEmployeeId: adminId,
      action: "company_settings_updated",
      details: { before, after },
    });

    return after;
  }

  private validateSettingsInput(input: UpdateSettingsInput): void {
    const checks: [string, number | undefined][] = [
      ["Default annual entitlement", input.defaultAnnualEntitlementDays],
      ["Eligibility period", input.eligibilityMonths],
      ["Leave cycle length", input.cycleLengthMonths],
      ["Back-to-work watchlist window", input.backToWorkWatchlistDays],
      ["Approaching-eligibility window", input.approachingEligibilityDays],
      ["Pending-approval alert threshold", input.pendingApprovalAlertDays],
    ];
    for (const [label, value] of checks) {
      if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
        throw ApiError.badRequest(`${label} must be a positive whole number.`);
      }
    }
  }

  private async rebuildCycleChain(employeeId: number): Promise<void> {
    const employee = await this.requireEmployee(employeeId);
    const settings = await this.settingsRepository.get();
    const allRequests = await this.leaveRepository.findByEmployeeId(employeeId);
    const confirmedReturns = allRequests
      .filter((r) => r.status === "approved" && r.actualBackToWorkDate !== null)
      .sort((a, b) => (a.actualBackToWorkDate as string).localeCompare(b.actualBackToWorkDate as string));

    await this.leaveCycleRepository.deleteAllByEmployeeId(employeeId);
    if (confirmedReturns.length === 0) {
      return;
    }

    const eligibleFrom = this.getEligibleFrom(employee, settings);
    const created: LeaveCycle[] = [];
    for (let i = 0; i < confirmedReturns.length; i++) {
      const request = confirmedReturns[i];
      const isFirstCycle = i === 0;
      const cycleStart = isFirstCycle ? eligibleFrom : parseISODate(request.actualBackToWorkDate as string);
      const cycleEnd = addDays(addMonths(cycleStart, settings.cycleLengthMonths), -1);

      created.push(
        await this.leaveCycleRepository.create({
          employeeId,
          cycleStart: toISODate(cycleStart),
          cycleEnd: toISODate(cycleEnd),
          entitlementDays: employee.annualEntitlementDays,
          generatedReason: isFirstCycle ? "initial" : "renewal",
          sourceLeaveRequestId: request.id,
        }),
      );
    }

    await this.auditRepository.record({
      employeeId,
      performedByEmployeeId: employeeId,
      action: "leave_cycle_generated",
      details: { cycles: created.map((c) => ({ cycleStart: c.cycleStart, cycleEnd: c.cycleEnd })) },
    });
  }

  private async requireEmployee(employeeId: number): Promise<Employee> {
    const employee = await this.employeeRepository.findById(employeeId);
    if (!employee) {
      throw ApiError.notFound("Employee not found");
    }
    return employee;
  }

  private validateDateShape(startDateInput: string, endDateInput: string): void {
    const startDate = parseISODate(startDateInput);
    const endDate = parseISODate(endDateInput);
    if (isAfter(startDate, endDate)) {
      throw ApiError.badRequest("End date must be on or after the start date.");
    }
    if (!isAfter(startDate, todayUTC())) {
      throw ApiError.badRequest("Start date must be at least one day in the future.");
    }
  }

  private getEligibleFrom(employee: Employee, settings: CompanySettings): Date {
    return addMonths(parseISODate(employee.joiningDate), settings.eligibilityMonths);
  }

  private async computeBalance(
    employee: Employee,
    allRequests: LeaveRequest[],
    reference: Date,
    cycleReference: Date = reference,
    settings: CompanySettings,
    activeNextCycleStart: string | null = null,
  ): Promise<LeaveBalance> {
    const cycleReferenceISO = toISODate(cycleReference);
    const cycles = await this.leaveCycleRepository.findByEmployeeId(employee.id);
    const confirmed = cycles
      .filter((c) => c.cycleStart <= cycleReferenceISO)
      .sort((a, b) => b.cycleStart.localeCompare(a.cycleStart))[0];

    let startISO: string;
    let endISO: string;
    let entitlement: number;
    let isEligible = true;
    if (confirmed) {
      startISO = confirmed.cycleStart;
      endISO = confirmed.cycleEnd;
      entitlement = confirmed.entitlementDays;
    } else {
      const eligibleFrom = this.getEligibleFrom(employee, settings);
      let windowStart = eligibleFrom;
      let windowEnd = addDays(addMonths(windowStart, settings.cycleLengthMonths), -1);
      while (isAfter(cycleReference, windowEnd)) {
        windowStart = addMonths(windowStart, settings.cycleLengthMonths);
        windowEnd = addDays(addMonths(windowStart, settings.cycleLengthMonths), -1);
      }
      startISO = toISODate(windowStart);
      endISO = toISODate(windowEnd);
      entitlement = employee.annualEntitlementDays;
      isEligible = !isBefore(reference, eligibleFrom);
    }

    let displayEndISO = endISO;
    if (activeNextCycleStart && activeNextCycleStart > startISO) {
      const cappedEnd = toISODate(addDays(parseISODate(activeNextCycleStart), -1));
      if (cappedEnd < displayEndISO) {
        displayEndISO = cappedEnd;
      }
    }

    const used = allRequests
      .filter((r) => r.status === "approved" && r.startDate >= startISO && r.startDate <= endISO)
      .reduce((sum, r) => sum + r.numberOfDays, 0);
    const pending = allRequests
      .filter((r) => r.status === "pending")
      .reduce((sum, r) => sum + r.numberOfDays, 0);

    return {
      isEligible,
      cycleStart: startISO,
      cycleEnd: displayEndISO,
      entitlement: isEligible ? entitlement : 0,
      used: isEligible ? used : 0,
      pending: isEligible ? pending : 0,
      remaining: isEligible ? entitlement - used - pending : 0,
      nextCycleStartsOn: isEligible
        ? activeNextCycleStart ?? toISODate(addDays(parseISODate(displayEndISO), 1))
        : null,
    };
  }

  private async computeBalanceForType(
    employee: Employee,
    leaveType: LeaveType,
    requestsOfType: LeaveRequest[],
    reference: Date,
    cycleReference: Date,
    settings: CompanySettings,
  ): Promise<LeaveBalance> {
    if (leaveType.code === "annual") {
      return this.computeBalance(employee, requestsOfType, reference, cycleReference, settings);
    }
    return this.computeSimpleTypeBalance(employee, leaveType, requestsOfType, reference, settings);
  }

  private async computeSimpleTypeBalance(
    employee: Employee,
    leaveType: LeaveType,
    requestsOfType: LeaveRequest[],
    reference: Date,
    settings: CompanySettings,
  ): Promise<LeaveBalance> {
    const windowOrigin = leaveType.requiresEligibility
      ? this.getEligibleFrom(employee, settings)
      : parseISODate(employee.joiningDate);
    const isEligible = !isBefore(reference, windowOrigin);

    let windowStart = windowOrigin;
    let windowEnd = addDays(addMonths(windowStart, settings.cycleLengthMonths), -1);
    while (isAfter(reference, windowEnd)) {
      windowStart = addMonths(windowStart, settings.cycleLengthMonths);
      windowEnd = addDays(addMonths(windowStart, settings.cycleLengthMonths), -1);
    }
    const startISO = toISODate(windowStart);
    const endISO = toISODate(windowEnd);

    const override = await this.leaveTypeRepository.getEmployeeEntitlementOverride(employee.id, leaveType.id);
    const entitlement = override ?? leaveType.defaultEntitlementDays ?? 0;

    const used = requestsOfType
      .filter((r) => r.status === "approved" && r.startDate >= startISO && r.startDate <= endISO)
      .reduce((sum, r) => sum + r.numberOfDays, 0);
    const pending = requestsOfType
      .filter((r) => r.status === "pending")
      .reduce((sum, r) => sum + r.numberOfDays, 0);

    return {
      isEligible,
      cycleStart: startISO,
      cycleEnd: endISO,
      entitlement: isEligible ? entitlement : 0,
      used: isEligible ? used : 0,
      pending: isEligible ? pending : 0,
      remaining: isEligible ? entitlement - used - pending : 0,
      nextCycleStartsOn: null,
    };
  }

  private async runChecks(
    employee: Employee,
    startDate: Date,
    endDate: Date,
    days: number,
    balance: LeaveBalance,
    settings: CompanySettings,
    leaveType: LeaveType,
  ): Promise<LeaveCheckItem[]> {
    const checks: LeaveCheckItem[] = [];

    if (leaveType.requiresEligibility) {
      const eligibleFrom = this.getEligibleFrom(employee, settings);
      const today = todayUTC();
      const isEligible = !isBefore(today, eligibleFrom);
      checks.push(
        isEligible
          ? {
              key: "eligibility",
              ok: true,
              title: `Eligible for ${leaveType.name.toLowerCase()}`,
              body: `Eligible since ${formatHumanDate(eligibleFrom)}.`,
            }
          : {
              key: "eligibility",
              ok: false,
              title: "Not yet eligible",
              body: `${leaveType.name} becomes available from ${formatHumanDate(eligibleFrom)} — 13th month from joining.`,
            },
      );
    }

    if (leaveType.isPaid) {
      const remainingAfter = balance.remaining - days;
      checks.push(
        remainingAfter >= 0
          ? {
              key: "balance",
              ok: true,
              title: "Sufficient balance",
              body: `${balance.remaining} days available for this ${days}-day request.`,
            }
          : {
              key: "balance",
              ok: false,
              title: "Insufficient balance",
              body: `Only ${balance.remaining} days available — this request needs ${days}.`,
            },
      );
    }

    const overlapping = await this.leaveRepository.findOverlapping(
      employee.id,
      toISODate(startDate),
      toISODate(endDate),
    );
    checks.push(
      overlapping.length === 0
        ? {
            key: "overlap",
            ok: true,
            title: "No overlapping leave",
            body: "These dates don't clash with any existing request.",
          }
        : {
            key: "overlap",
            ok: false,
            title: "Overlaps an existing request",
            body: `Clashes with your ${overlapping[0].status} request, ${formatHumanDate(parseISODate(overlapping[0].startDate))} – ${formatHumanDate(parseISODate(overlapping[0].endDate))}.`,
          },
    );

    return checks;
  }

  private async getTeamOverlap(employee: Employee, startDate: Date, endDate: Date): Promise<TeamOverlapEntry[]> {
    if (employee.managerId === null) return [];

    const peers = (await this.employeeRepository.findByManagerId(employee.managerId)).filter(
      (peer) => peer.id !== employee.id,
    );

    const overlaps: TeamOverlapEntry[] = [];
    for (const peer of peers) {
      const peerRequests = await this.leaveRepository.findOverlapping(
        peer.id,
        toISODate(startDate),
        toISODate(endDate),
      );
      for (const request of peerRequests) {
        if (request.status !== "approved" && request.status !== "pending") continue;
        overlaps.push({
          employeeId: peer.id,
          name: peer.fullName,
          dates: `${formatHumanDate(parseISODate(request.startDate))} – ${formatHumanDate(parseISODate(request.endDate))}`,
        });
      }
    }
    return overlaps;
  }
}

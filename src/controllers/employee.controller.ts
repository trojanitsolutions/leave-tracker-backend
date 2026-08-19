import { Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { sendSuccess } from "../common/ApiResponse";
import {
  CreateEmployeeInput,
  EmployeeFilter,
  UpdateEmployeeInput,
} from "../interfaces/employee-repository.interface";
import { EmployeeService } from "../services/employee.service";
import { LeaveService } from "../services/leave.service";
import { UserRole } from "../types/entities";
import { EmployeeDirectoryRow } from "../types/leave";

export class EmployeeController {
  constructor(
    private readonly employeeService: EmployeeService,
    private readonly leaveService: LeaveService,
  ) {}

  private id(req: Request): number {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw ApiError.badRequest("Invalid employee id.");
    }
    return id;
  }

  private performedBy(req: Request): number {
    if (!req.user) throw ApiError.unauthorized();
    return req.user.employeeId;
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, string | undefined>;
    const filter: EmployeeFilter = {
      department: query.department || undefined,
      role: (query.role as UserRole | undefined) || undefined,
      managerId: query.managerId ? Number(query.managerId) : undefined,
      isActive: query.isActive === undefined ? undefined : query.isActive === "true",
      search: query.search || undefined,
    };

    const [employees, allEmployees] = await Promise.all([
      this.employeeService.list(filter),
      this.employeeService.list({}),
    ]);
    const nameById = new Map(allEmployees.map((e) => [e.id, e.fullName]));

    const rows: EmployeeDirectoryRow[] = await Promise.all(
      employees.map(async (employee) => {
        const overview = await this.leaveService.getOverview(employee.id);
        return {
          employee,
          managerName: employee.managerId !== null ? nameById.get(employee.managerId) ?? null : null,
          balance: overview.balance,
        };
      }),
    );

    sendSuccess(res, rows);
  };

  get = async (req: Request, res: Response): Promise<void> => {
    const employee = await this.employeeService.get(this.id(req));
    sendSuccess(res, employee);
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const result = await this.employeeService.create(
      req.body as CreateEmployeeInput,
      this.performedBy(req),
    );
    sendSuccess(res, result, 201);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.employeeService.update(
      this.id(req),
      req.body as UpdateEmployeeInput,
      this.performedBy(req),
    );
    sendSuccess(res, updated);
  };
}

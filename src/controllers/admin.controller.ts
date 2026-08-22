import { Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { sendSuccess } from "../common/ApiResponse";
import { LeaveService } from "../services/leave.service";

export class AdminController {
  constructor(private readonly leaveService: LeaveService) {}

  private employeeId(req: Request): number {
    if (!req.user) throw ApiError.unauthorized();
    return req.user.employeeId;
  }

  overview = async (_req: Request, res: Response): Promise<void> => {
    const overview = await this.leaveService.getAdminOverview();
    sendSuccess(res, overview);
  };

  auditHistory = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, string | undefined>;
    const history = await this.leaveService.getAuditHistory({
      employeeId: query.employeeId ? Number(query.employeeId) : undefined,
      from: query.from || undefined,
      to: query.to || undefined,
    });
    sendSuccess(res, history);
  };

  getSettings = async (_req: Request, res: Response): Promise<void> => {
    const settings = await this.leaveService.getSettings();
    sendSuccess(res, settings);
  };

  updateSettings = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveService.updateSettings(this.employeeId(req), req.body);
    sendSuccess(res, updated);
  };

  listLeaveRecords = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, string | undefined>;
    const records = await this.leaveService.getAdminLeaveRecords({
      employeeId: query.employeeId ? Number(query.employeeId) : undefined,
      department: query.department || undefined,
      managerId: query.managerId ? Number(query.managerId) : undefined,
      kind: query.kind === "leave" || query.kind === "extension" ? query.kind : undefined,
      leaveTypeId: query.leaveTypeId ? Number(query.leaveTypeId) : undefined,
      status:
        query.status === "pending" ||
        query.status === "approved" ||
        query.status === "rejected" ||
        query.status === "cancelled"
          ? query.status
          : undefined,
      from: query.from || undefined,
      to: query.to || undefined,
    });
    sendSuccess(res, records);
  };

  correctLeaveRecord = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveService.correctLeaveRecord(
      this.employeeId(req),
      Number(req.params.id),
      req.body,
    );
    sendSuccess(res, updated);
  };

  recordBackToWork = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveService.recordActualBackToWork(
      this.employeeId(req),
      Number(req.params.id),
      req.body.actualBackToWorkDate,
    );
    sendSuccess(res, updated);
  };

  calendar = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, string | undefined>;
    const calendar = await this.leaveService.getAdminCalendar(query.month, query.department || undefined);
    sendSuccess(res, calendar);
  };

  reports = async (req: Request, res: Response): Promise<void> => {
    const query = req.query as Record<string, string | undefined>;
    const reports = await this.leaveService.getReports(
      query.year ? Number(query.year) : undefined,
      query.department || undefined,
    );
    sendSuccess(res, reports);
  };
}

import { Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { sendSuccess } from "../common/ApiResponse";
import { LeaveService } from "../services/leave.service";

export class LeaveController {
  constructor(private readonly leaveService: LeaveService) {}

  private employeeId(req: Request): number {
    if (!req.user) throw ApiError.unauthorized();
    return req.user.employeeId;
  }

  overview = async (req: Request, res: Response): Promise<void> => {
    const overview = await this.leaveService.getOverview(this.employeeId(req));
    sendSuccess(res, overview);
  };

  history = async (req: Request, res: Response): Promise<void> => {
    const history = await this.leaveService.getHistory(this.employeeId(req));
    sendSuccess(res, history);
  };

  cycles = async (req: Request, res: Response): Promise<void> => {
    const cycles = await this.leaveService.getMyCycles(this.employeeId(req));
    sendSuccess(res, cycles);
  };

  precheck = async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate, leaveTypeId } = req.body as {
      startDate?: string;
      endDate?: string;
      leaveTypeId?: number;
    };
    if (!startDate || !endDate) {
      throw ApiError.badRequest("startDate and endDate are required.");
    }
    const result = await this.leaveService.precheck(this.employeeId(req), startDate, endDate, leaveTypeId);
    sendSuccess(res, result);
  };

  apply = async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate, reason, attachmentName, attachmentUrl, leaveTypeId } = req.body as {
      startDate?: string;
      endDate?: string;
      reason?: string | null;
      attachmentName?: string | null;
      attachmentUrl?: string | null;
      leaveTypeId?: number;
    };
    if (!startDate || !endDate) {
      throw ApiError.badRequest("startDate and endDate are required.");
    }
    const created = await this.leaveService.applyLeave(this.employeeId(req), {
      startDate,
      endDate,
      reason: reason ?? null,
      attachmentName: attachmentName ?? null,
      attachmentUrl: attachmentUrl ?? null,
      leaveTypeId,
    });
    sendSuccess(res, created, 201);
  };

  private leaveRequestId(req: Request): number {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw ApiError.badRequest("Invalid leave request id.");
    }
    return id;
  }

  managerQueue = async (req: Request, res: Response): Promise<void> => {
    const queue = await this.leaveService.getManagerQueue(this.employeeId(req));
    sendSuccess(res, queue);
  };

  managerOverview = async (req: Request, res: Response): Promise<void> => {
    const overview = await this.leaveService.getManagerOverview(this.employeeId(req));
    sendSuccess(res, overview);
  };

  teamHistory = async (req: Request, res: Response): Promise<void> => {
    const history = await this.leaveService.getTeamHistory(this.employeeId(req));
    sendSuccess(res, history);
  };

  teamCalendar = async (req: Request, res: Response): Promise<void> => {
    const month = (req.query.month as string | undefined) || undefined;
    const department = (req.query.department as string | undefined) || undefined;
    const calendar = await this.leaveService.getTeamCalendar(month, department);
    sendSuccess(res, calendar);
  };

  approve = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveService.decide(
      this.employeeId(req),
      this.leaveRequestId(req),
      "approved",
    );
    sendSuccess(res, updated);
  };

  reject = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveService.decide(
      this.employeeId(req),
      this.leaveRequestId(req),
      "rejected",
    );
    sendSuccess(res, updated);
  };

  undo = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveService.undoDecision(this.employeeId(req), this.leaveRequestId(req));
    sendSuccess(res, updated);
  };
}

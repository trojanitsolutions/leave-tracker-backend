import { Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { sendSuccess } from "../common/ApiResponse";
import { LeaveService } from "../services/leave.service";

export class ExtensionController {
  constructor(private readonly leaveService: LeaveService) {}

  private employeeId(req: Request): number {
    if (!req.user) throw ApiError.unauthorized();
    return req.user.employeeId;
  }

  private extensionId(req: Request): number {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      throw ApiError.badRequest("Invalid extension id.");
    }
    return id;
  }

  precheck = async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate } = req.body as { startDate?: string; endDate?: string };
    if (!startDate || !endDate) {
      throw ApiError.badRequest("startDate and endDate are required.");
    }
    const result = await this.leaveService.precheckExtension(this.employeeId(req), startDate, endDate);
    sendSuccess(res, result);
  };

  apply = async (req: Request, res: Response): Promise<void> => {
    const { startDate, endDate, reason, attachmentName } = req.body as {
      startDate?: string;
      endDate?: string;
      reason?: string | null;
      attachmentName?: string | null;
    };
    if (!startDate || !endDate) {
      throw ApiError.badRequest("startDate and endDate are required.");
    }
    const created = await this.leaveService.applyExtension(this.employeeId(req), {
      startDate,
      endDate,
      reason: reason ?? null,
      attachmentName: attachmentName ?? null,
    });
    sendSuccess(res, created, 201);
  };

  approve = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveService.decideExtension(
      this.employeeId(req),
      this.extensionId(req),
      "approved",
    );
    sendSuccess(res, updated);
  };

  reject = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveService.decideExtension(
      this.employeeId(req),
      this.extensionId(req),
      "rejected",
    );
    sendSuccess(res, updated);
  };

  undo = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveService.undoExtensionDecision(
      this.employeeId(req),
      this.extensionId(req),
    );
    sendSuccess(res, updated);
  };
}

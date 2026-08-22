import { Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { sendSuccess } from "../common/ApiResponse";
import { LeaveTypeService } from "../services/leave-type.service";

export class LeaveTypeController {
  constructor(private readonly leaveTypeService: LeaveTypeService) {}

  private employeeId(req: Request): number {
    if (!req.user) throw ApiError.unauthorized();
    return req.user.employeeId;
  }

  list = async (_req: Request, res: Response): Promise<void> => {
    const types = await this.leaveTypeService.list();
    sendSuccess(res, types);
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const created = await this.leaveTypeService.create(this.employeeId(req), req.body);
    sendSuccess(res, created, 201);
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveTypeService.update(this.employeeId(req), Number(req.params.id), req.body);
    sendSuccess(res, updated);
  };

  deactivate = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveTypeService.deactivate(this.employeeId(req), Number(req.params.id));
    sendSuccess(res, updated);
  };

  reactivate = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveTypeService.reactivate(this.employeeId(req), Number(req.params.id));
    sendSuccess(res, updated);
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    await this.leaveTypeService.remove(this.employeeId(req), Number(req.params.id));
    sendSuccess(res, { deleted: true });
  };
}

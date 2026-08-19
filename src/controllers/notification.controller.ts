import { Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { sendSuccess } from "../common/ApiResponse";
import { LeaveService } from "../services/leave.service";

export class NotificationController {
  constructor(private readonly leaveService: LeaveService) {}

  private employeeId(req: Request): number {
    if (!req.user) throw ApiError.unauthorized();
    return req.user.employeeId;
  }

  list = async (req: Request, res: Response): Promise<void> => {
    const notifications = await this.leaveService.getNotifications(this.employeeId(req));
    sendSuccess(res, notifications);
  };

  unreadCount = async (req: Request, res: Response): Promise<void> => {
    const count = await this.leaveService.getUnreadNotificationCount(this.employeeId(req));
    sendSuccess(res, { count });
  };

  markRead = async (req: Request, res: Response): Promise<void> => {
    const updated = await this.leaveService.markNotificationRead(
      this.employeeId(req),
      Number(req.params.id),
    );
    sendSuccess(res, updated);
  };

  markAllRead = async (req: Request, res: Response): Promise<void> => {
    await this.leaveService.markAllNotificationsRead(this.employeeId(req));
    sendSuccess(res, { success: true });
  };

  dismiss = async (req: Request, res: Response): Promise<void> => {
    await this.leaveService.dismissNotification(this.employeeId(req), Number(req.params.id));
    sendSuccess(res, { success: true });
  };
}

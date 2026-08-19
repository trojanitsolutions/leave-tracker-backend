import { Request, Response } from "express";
import { sendSuccess } from "../common/ApiResponse";
import { HealthService } from "../services/health.service";

export class HealthController {
  constructor(private readonly healthService: HealthService = new HealthService()) {}

  getStatus = async (_req: Request, res: Response): Promise<void> => {
    const status = await this.healthService.getStatus();
    sendSuccess(res, status);
  };

  getDatabaseStatus = async (_req: Request, res: Response): Promise<void> => {
    const status = await this.healthService.getDatabaseStatus();
    sendSuccess(res, status);
  };
}

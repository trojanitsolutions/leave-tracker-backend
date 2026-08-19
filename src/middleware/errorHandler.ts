import { NextFunction, Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { ApiErrorBody } from "../types/api";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const isApiError = err instanceof ApiError;
  const statusCode = isApiError ? err.statusCode : 500;
  const message = isApiError ? err.message : "Internal server error";

  if (!isApiError) {
    console.error(err);
  }

  const body: ApiErrorBody = {
    success: false,
    message,
    ...(isApiError && err.details !== undefined ? { details: err.details } : {}),
  };

  res.status(statusCode).json(body);
}

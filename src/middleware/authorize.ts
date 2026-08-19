import { NextFunction, Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { UserRole } from "../types/entities";

export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(ApiError.forbidden(`Role '${req.user.role}' is not permitted to perform this action`));
      return;
    }

    next();
  };
}

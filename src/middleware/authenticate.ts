import { NextFunction, Request, Response } from "express";
import { ApiError } from "../common/ApiError";
import { verifyToken } from "../common/jwt";
import { env } from "../config/env";

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[env.auth.accessCookieName];

  if (!token) {
    next(ApiError.unauthorized("Not signed in"));
    return;
  }

  try {
    req.user = verifyToken(token, "access");
    next();
  } catch {
    next(ApiError.unauthorized("Session expired — please sign in again"));
  }
}

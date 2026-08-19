import { UserRole } from "./entities";

export type TokenType = "access" | "refresh" | "reset";

export interface AuthTokenPayload {
  employeeId: number;
  email: string;
  role: UserRole;
  tokenVersion: number;
  type: TokenType;
}

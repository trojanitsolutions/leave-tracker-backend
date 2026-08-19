import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AuthTokenPayload, TokenType } from "../types/auth";

type IssuablePayload = Omit<AuthTokenPayload, "type">;

export function signAccessToken(payload: IssuablePayload): string {
  const options: jwt.SignOptions = { expiresIn: env.jwt.accessExpiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign({ ...payload, type: "access" }, env.jwt.secret, options);
}

export function signRefreshToken(payload: IssuablePayload): string {
  const options: jwt.SignOptions = { expiresIn: env.jwt.refreshExpiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign({ ...payload, type: "refresh" }, env.jwt.secret, options);
}

export function signResetToken(payload: IssuablePayload): string {
  const options: jwt.SignOptions = { expiresIn: "10m" };
  return jwt.sign({ ...payload, type: "reset" }, env.jwt.secret, options);
}

export function verifyToken(token: string, expectedType: TokenType): AuthTokenPayload {
  const decoded = jwt.verify(token, env.jwt.secret) as AuthTokenPayload;
  if (decoded.type !== expectedType) {
    throw new Error(`Expected a ${expectedType} token`);
  }
  return decoded;
}

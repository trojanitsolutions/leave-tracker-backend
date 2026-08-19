import dotenv from "dotenv";

dotenv.config();

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const DURATION_UNIT_MS: Record<string, number> = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function parseDurationMs(input: string): number {
  const match = /^(\d+)(s|m|h|d)$/.exec(input.trim());
  if (!match) {
    throw new Error(`Invalid duration "${input}" — expected a format like "15m", "7d".`);
  }
  return Number(match[1]) * DURATION_UNIT_MS[match[2]];
}

const jwtAccessExpiresIn = optional("JWT_ACCESS_EXPIRES_IN", "15m");
const jwtRefreshExpiresIn = optional("JWT_REFRESH_EXPIRES_IN", "7d");

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "4000")),
  corsOrigin: optional("CORS_ORIGIN", "http://localhost:3000"),
  db: {
    host: optional("DB_HOST", "localhost"),
    port: Number(optional("DB_PORT", "3306")),
    user: optional("DB_USER", "root"),
    password: optional("DB_PASSWORD", ""),
    name: optional("DB_NAME", "trojan_leave_tracker"),
    connectionLimit: Number(optional("DB_CONNECTION_LIMIT", "10")),
    sslCa: optional("DB_SSL_CA", ""),
  },
  jwt: {
    secret: optional("JWT_SECRET", "dev-only-insecure-secret"),
    accessExpiresIn: jwtAccessExpiresIn,
    refreshExpiresIn: jwtRefreshExpiresIn,
  },
  auth: {
    accessCookieName: "ttlt_access",
    refreshCookieName: "ttlt_refresh",
    accessCookieMaxAgeMs: parseDurationMs(jwtAccessExpiresIn),
    refreshCookieMaxAgeMs: parseDurationMs(jwtRefreshExpiresIn),
    refreshCookiePath: "/api/auth",
  },
  smtp: {
    host: optional("SMTP_HOST", "smtp.gmail.com"),
    port: Number(optional("SMTP_PORT", "587")),
    user: optional("SMTP_USER", ""),
    password: optional("SMTP_PASSWORD", ""),
    fromName: optional("SMTP_FROM_NAME", "Trojan Leave Tracker"),
  },
} as const;

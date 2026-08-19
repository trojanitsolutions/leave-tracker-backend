import { checkDatabaseConnection } from "../config/database";

export class HealthService {
  async getStatus(): Promise<{ status: "ok"; timestamp: string }> {
    return { status: "ok", timestamp: new Date().toISOString() };
  }

  async getDatabaseStatus(): Promise<{ database: "connected" | "unreachable" }> {
    const connected = await checkDatabaseConnection();
    return { database: connected ? "connected" : "unreachable" };
  }
}

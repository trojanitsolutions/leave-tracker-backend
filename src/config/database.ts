import mysql from "mysql2/promise";
import { env } from "./env";

export const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  connectionLimit: env.db.connectionLimit,
  waitForConnections: true,
  dateStrings: true,
  ssl: env.db.sslCa ? { ca: env.db.sslCa } : undefined,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
});

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch {
    return false;
  }
}

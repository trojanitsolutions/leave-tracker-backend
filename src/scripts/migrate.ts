import { readFileSync } from "fs";
import { join } from "path";
import mysql from "mysql2/promise";
import { env } from "../config/env";

async function migrate(): Promise<void> {
  const schemaPath = join(__dirname, "..", "db", "schema.sql");
  const schemaSql = readFileSync(schemaPath, "utf-8");

  const connection = await mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    multipleStatements: true,
    ssl: env.db.sslCa ? { ca: env.db.sslCa } : undefined,
  });

  try {
    await connection.query(schemaSql);
    console.log("Schema migrated.");
  } finally {
    await connection.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

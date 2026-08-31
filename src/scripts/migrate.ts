import { readFileSync } from "fs";
import { join } from "path";
import mysql from "mysql2/promise";
import { env } from "../config/env";

async function columnExists(connection: mysql.Connection, table: string, column: string): Promise<boolean> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [env.db.name, table, column],
  );
  return Number(rows[0].cnt) > 0;
}

async function isColumnNullable(connection: mysql.Connection, table: string, column: string): Promise<boolean> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [env.db.name, table, column],
  );
  return rows[0]?.IS_NULLABLE === "YES";
}

async function constraintExists(connection: mysql.Connection, table: string, constraintName: string): Promise<boolean> {
  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    [env.db.name, table, constraintName],
  );
  return Number(rows[0].cnt) > 0;
}

async function ensureLeaveTypeColumn(connection: mysql.Connection): Promise<void> {
  const targets: { table: string; fk: string; code: string }[] = [
    { table: "leave_requests", fk: "fk_leave_type", code: "annual" },
    { table: "leave_extensions", fk: "fk_ext_leave_type", code: "unpaid_extension" },
  ];

  for (const { table, fk, code } of targets) {
    if (!(await columnExists(connection, table, "leave_type_id"))) {
      await connection.query(`ALTER TABLE ${table} ADD COLUMN leave_type_id INT UNSIGNED NULL`);
    }

    const [typeRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT id FROM leave_types WHERE code = ?",
      [code],
    );
    const typeId = typeRows[0]?.id;
    if (typeId) {
      await connection.query(`UPDATE ${table} SET leave_type_id = ? WHERE leave_type_id IS NULL`, [typeId]);
    }

    if (await isColumnNullable(connection, table, "leave_type_id")) {
      await connection.query(`ALTER TABLE ${table} MODIFY leave_type_id INT UNSIGNED NOT NULL`);
    }

    if (!(await constraintExists(connection, table, fk))) {
      await connection.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${fk} FOREIGN KEY (leave_type_id) REFERENCES leave_types (id)`,
      );
    }
  }
}

async function ensureAttachmentUrlColumn(connection: mysql.Connection): Promise<void> {
  for (const table of ["leave_requests", "leave_extensions"]) {
    if (!(await columnExists(connection, table, "attachment_url"))) {
      await connection.query(`ALTER TABLE ${table} ADD COLUMN attachment_url VARCHAR(500) NULL`);
    }
  }
}

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
    await ensureLeaveTypeColumn(connection);
    await ensureAttachmentUrlColumn(connection);
    console.log("Schema migrated.");
  } finally {
    await connection.end();
  }
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});

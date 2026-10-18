import { readFileSync } from "node:fs";
import { join } from "node:path";
import mysql from "mysql2/promise";

const ENV_FILE = process.env.MIGRATE_ENV_FILE ?? ".env.local";

function loadEnvFile() {
  try {
    const raw = readFileSync(join(process.cwd(), ENV_FILE), "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch {
    // env file is optional when variables are already exported
  }
}

loadEnvFile();

const required = ["MYSQL_HOST", "MYSQL_USER", "MYSQL_DATABASE"];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const host = process.env.MYSQL_HOST;
const port = Number(process.env.MYSQL_PORT ?? 3306);
const user = process.env.MYSQL_USER;
const password = process.env.MYSQL_PASSWORD ?? "";
const database = process.env.MYSQL_DATABASE;

async function main() {
  const root = await mysql.createConnection({ host, port, user, password });
  const [versionRows] = await root.query("SELECT VERSION() AS version");
  const serverVersion = String(versionRows[0]?.version ?? "");
  // utf8mb4_unicode_ci tersedia di MySQL 5.7+/8.x dan MariaDB, jadi schema
  // memakai collation ini agar portable.
  const collation = "utf8mb4_unicode_ci";
  console.log(`Server: ${serverVersion} (collation: ${collation})`);

  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE ${collation}`
  );
  await root.end();

  const connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true,
    charset: "utf8mb4",
  });

  const [existing] = await connection.query(
    `SELECT TABLE_NAME AS name, TABLE_COLLATION AS collation
       FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?`,
    [database]
  );

  const needsConversion = existing.some(
    (table) => table.collation && table.collation !== collation
  );

  if (needsConversion) {
    // Foreign key harus dilepas dulu: kolom referensi dan yang direferensikan
    // tidak boleh berbeda collation saat proses konversi.
    const [foreignKeys] = await connection.query(
      `SELECT k.CONSTRAINT_NAME AS name, k.TABLE_NAME AS tableName, k.COLUMN_NAME AS columnName,
              k.REFERENCED_TABLE_NAME AS refTable, k.REFERENCED_COLUMN_NAME AS refColumn,
              r.DELETE_RULE AS onDelete
         FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS r
           ON r.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA
          AND r.CONSTRAINT_NAME = k.CONSTRAINT_NAME
        WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL`,
      [database]
    );

    for (const fk of foreignKeys) {
      await connection.query(`ALTER TABLE \`${fk.tableName}\` DROP FOREIGN KEY \`${fk.name}\``);
    }

    for (const table of existing) {
      console.log(`Menyesuaikan collation ${table.name}: ${table.collation} -> ${collation}`);
      await connection.query(
        `ALTER TABLE \`${table.name}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE ${collation}`
      );
    }

    for (const fk of foreignKeys) {
      await connection.query(
        `ALTER TABLE \`${fk.tableName}\`
           ADD CONSTRAINT \`${fk.name}\` FOREIGN KEY (\`${fk.columnName}\`)
           REFERENCES \`${fk.refTable}\` (\`${fk.refColumn}\`) ON DELETE ${fk.onDelete}`
      );
    }

    console.log(`Foreign key dipulihkan: ${foreignKeys.length}`);
  }

  const schema = readFileSync(join(process.cwd(), "db", "schema.sql"), "utf8");
  const statements = schema
    .split(/;\s*$/m)
    .map((statement) =>
      statement
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
    )
    .filter(Boolean);

  for (const [index, statement] of statements.entries()) {
    try {
      await connection.query(statement);
    } catch (error) {
      const table = /CREATE TABLE IF NOT EXISTS (\w+)/i.exec(statement)?.[1] ?? `statement #${index + 1}`;
      console.error(`\nGagal pada ${table}: ${error.sqlMessage ?? error.message}`);
      if (error.errno === 150) {
        console.error(
          "Foreign key gagal: pastikan tabel yang direferensikan sudah dibuat lebih dulu " +
            "dan kolomnya punya tipe + collation yang sama."
        );
      }
      await connection.end();
      process.exit(1);
    }
  }

  await connection.end();
  console.log(`Migrations applied to database "${database}".`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

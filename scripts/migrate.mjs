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
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
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

  for (const statement of statements) {
    await connection.query(statement);
  }

  await connection.end();
  console.log(`Migrations applied to database "${database}".`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

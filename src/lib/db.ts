import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";

function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const globalForMysql = globalThis as unknown as { mysqlPool?: Pool };

export function getPool(): Pool {
  if (!globalForMysql.mysqlPool) {
    globalForMysql.mysqlPool = mysql.createPool({
      host: required("MYSQL_HOST"),
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: required("MYSQL_USER"),
      password: process.env.MYSQL_PASSWORD ?? "",
      database: required("MYSQL_DATABASE"),
      connectionLimit: Number(process.env.MYSQL_POOL_SIZE ?? 10),
      charset: "utf8mb4",
      dateStrings: true,
      timezone: "Z",
    });
  }
  return globalForMysql.mysqlPool;
}

export async function query<T extends object>(
  sql: string,
  values: unknown[] = []
): Promise<T[]> {
  const [rows] = await getPool().query<T[] & mysql.RowDataPacket[]>(sql, values);
  return rows;
}

export async function execute(
  sql: string,
  values: unknown[] = []
): Promise<mysql.ResultSetHeader> {
  const [result] = await getPool().query<mysql.ResultSetHeader>(sql, values);
  return result;
}

import "reflect-metadata";
import { DataSource } from "typeorm";
import { allEntities } from "./entities";
import { seed } from "./seed";
import path from "node:path";
import fs from "node:fs";

export type AppDb = DataSource;
export * from "./entities";

export async function createDb(dbPath = process.env.DATABASE_PATH ?? "./data/app.db"): Promise<AppDb> {
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const ds = new DataSource({
    type: "better-sqlite3",
    database: dbPath,
    entities: allEntities,
    synchronize: true,
  });
  await ds.initialize();
  if (dbPath !== ":memory:") {
    await ds.query("PRAGMA journal_mode = WAL");
  }
  await seed(ds);
  return ds;
}

let singleton: Promise<AppDb> | undefined;

export function getDb(): Promise<AppDb> {
  singleton ??= createDb();
  return singleton;
}

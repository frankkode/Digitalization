/**
 * Minimal repository over a JSON file.
 *
 * Design decision: a file store keeps the proof of concept free of native dependencies
 * so assessors can run it with `npm install && npm run dev`. All access goes through
 * `readDb` / `updateDb`, so a PostgreSQL (e.g. Supabase) repository can replace it later
 * without changing the automation modules.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Database } from "./types";

const DB_PATH = process.env.NORDISO_DB_PATH ?? path.join(process.cwd(), "data", "db.json");

export function emptyDb(): Database {
  return {
    clients: [], inquiries: [], quotes: [], contracts: [], invoices: [],
    outbox: [], tasks: [], events: [], rejectedSubmissions: 0, clockOffsetMs: 0,
  };
}

/** In memory mode is used by unit tests and the simulation script. */
let memoryDb: Database | null = null;
export function useMemoryStore(db: Database = emptyDb()): void {
  memoryDb = db;
}

export function readDb(): Database {
  if (memoryDb) return memoryDb;
  if (!fs.existsSync(DB_PATH)) return emptyDb();
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8")) as Database;
}

function writeDb(db: Database): void {
  if (memoryDb) { memoryDb = db; return; }
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  // write to a temp file first, then rename: avoids a half written file on crash
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

/** Read, mutate and persist in one step; returns whatever the mutator returns. */
export function updateDb<T>(mutator: (db: Database) => T): T {
  const db = readDb();
  const result = mutator(db);
  writeDb(db);
  return result;
}

export function resetDb(): void {
  writeDb(emptyDb());
}

/** Short, prefixed identifiers keep logs readable (e.g. inq_3f9a2c). */
export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(4).toString("hex")}`;
}

export function newToken(): string {
  return crypto.randomBytes(16).toString("hex");
}

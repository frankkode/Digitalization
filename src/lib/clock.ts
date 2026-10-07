/**
 * Clock abstraction. Timer based automation (follow up reminders, expiry) must be
 * demonstrable without waiting days, so the dashboard can shift the clock forward.
 */
import { readDb, updateDb } from "./store";

const DAY_MS = 24 * 60 * 60 * 1000;

export function now(): Date {
  return new Date(Date.now() + readDb().clockOffsetMs);
}

export function nowIso(): string {
  return now().toISOString();
}

export function advanceClock(days: number): Date {
  updateDb((db) => { db.clockOffsetMs += days * DAY_MS; });
  return now();
}

export function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * DAY_MS).toISOString();
}

export function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (60 * 60 * 1000);
}

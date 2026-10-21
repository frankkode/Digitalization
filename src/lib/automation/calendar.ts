/**
 * Calendar invitation in iCalendar format (RFC 5545), version 1.0 addition.
 *
 * The booking confirmation carries a standard .ics file, so the discovery call lands in
 * Outlook, Google Calendar or Apple Calendar without any calendar account or API key.
 * Rules implemented from the standard: CRLF line endings, UTC timestamps, escaped text
 * values and folding of lines longer than 75 octets.
 */

export interface CalendarEvent {
  uid: string;            // globally unique, stable per booking
  start: string;          // ISO 8601
  durationMinutes: number;
  summary: string;
  description: string;
  organizerEmail: string;
  attendeeEmail: string;
  stampIso: string;       // creation time (DTSTAMP)
}

/** 2026-10-01T06:00:00.000Z -> 20261001T060000Z */
export function toIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escapes characters that have a meaning in iCalendar TEXT values. */
export function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line to at most 75 octets; continuation lines start with one space. */
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74;   // continuation lines lose one octet to the space
    if (Buffer.byteLength(current + ch, "utf8") > limit) { parts.push(current); current = ch; }
    else current += ch;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(e: CalendarEvent): string {
  const end = new Date(new Date(e.start).getTime() + e.durationMinutes * 60_000).toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Nordiso//Intake Automation 1.0//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${e.uid}`,
    `DTSTAMP:${toIcsDate(e.stampIso)}`,
    `DTSTART:${toIcsDate(e.start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeText(e.summary)}`,
    `DESCRIPTION:${escapeText(e.description)}`,
    `ORGANIZER:mailto:${e.organizerEmail}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${e.attendeeEmail}`,
    "STATUS:CONFIRMED",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Discovery call with Nordiso",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

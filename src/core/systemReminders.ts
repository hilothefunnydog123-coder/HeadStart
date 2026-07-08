import type { DeparturePlan } from "./types";
import { displayDestination } from "./schedule";

const REMINDER_DURATION_MINUTES = 5;

export function systemReminderFileName(plan: DeparturePlan): string {
  const date = plan.arriveBy.toISOString().slice(0, 10);
  const title = slug(plan.commitment.title || "schedule");
  return `headstart-reminders-${date}-${title}.ics`;
}

export function systemReminderCalendar(
  plan: DeparturePlan,
  createdAt = new Date(),
): string {
  const events = [
    {
      key: "wake",
      at: plan.wakeBy,
      summary: plan.usesWake
        ? `Prep for ${plan.commitment.title}`
        : `Get ready for ${plan.commitment.title}`,
      description: `Leave by ${timeLabel(plan.leaveBy)} for ${plan.commitment.title}.`,
    },
    {
      key: "leave",
      at: plan.leaveBy,
      summary: `Leave for ${plan.commitment.title}`,
      description: `Head to ${displayDestination(plan.commitment)}. Arrive by ${timeLabel(
        plan.arriveBy,
      )}.`,
    },
  ];

  return lines([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//HeadStart//Student Schedule Assistant//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events.flatMap((event) => [
      "BEGIN:VEVENT",
      `UID:${escapeIcsText(
        `${plan.commitment.id}-${event.key}-${plan.arriveBy.toISOString()}@departure`,
      )}`,
      `DTSTAMP:${formatUtc(createdAt)}`,
      `DTSTART:${formatUtc(event.at)}`,
      `DURATION:PT${REMINDER_DURATION_MINUTES}M`,
      `SUMMARY:${escapeIcsText(event.summary)}`,
      `DESCRIPTION:${escapeIcsText(event.description)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:PT0M",
      `DESCRIPTION:${escapeIcsText(event.summary)}`,
      "END:VALARM",
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ]);
}

function formatUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function timeLabel(date: Date): string {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function lines(values: string[]): string {
  return `${values.join("\r\n")}\r\n`;
}

function slug(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "departure";
}

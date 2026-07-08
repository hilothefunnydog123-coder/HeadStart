import type { DeparturePlan } from "./types";
import { formatClock, formatDuration } from "./time";
import {
  displayDestination,
  displayItemKind,
  isStudyItem,
} from "./schedule";

export const NOTIFICATION_CATCH_UP_MS = 60_000;

export interface AlarmNotification {
  id: string;
  at: Date;
  title: string;
  body: string;
  tag: string;
}

export type NotificationDeliveryState =
  | { status: "future"; delayMs: number }
  | { status: "due" }
  | { status: "expired" };

export function alarmNotificationsForPlan(
  plan: DeparturePlan,
): AlarmNotification[] {
  const prepLeadMinutes = Math.max(
    1,
    Math.round((plan.leaveBy.getTime() - plan.wakeBy.getTime()) / 60_000),
  );
  const prepTitle = plan.usesWake
    ? "Start prep for first class"
    : `Leave for ${plan.commitment.title} in ${formatDuration(prepLeadMinutes)}`;
  const itemKind = displayItemKind(plan.commitment).toLowerCase();
  const leaveTitle = isStudyItem(plan.commitment)
    ? `Study ${studyLabel(plan)} now`
    : `Leave for ${plan.commitment.title}`;
  const leaveBody = isStudyItem(plan.commitment)
    ? studyBody(plan)
    : `Head to ${displayDestination(plan.commitment)}. ETA ${formatClock(
        plan.arriveBy,
      )} for this ${itemKind}.`;
  const notifications: AlarmNotification[] = [
    {
      id: notificationId(plan, "wake"),
      at: plan.wakeBy,
      title: prepTitle,
      body: plan.usesWake
        ? `Leave by ${formatClock(plan.leaveBy)} for ${plan.commitment.title}.`
        : `Pack up and head out at ${formatClock(plan.leaveBy)}.`,
      tag: `departure-${notificationId(plan, "wake")}`,
    },
    {
      id: notificationId(plan, "leave"),
      at: plan.leaveBy,
      title: leaveTitle,
      body: leaveBody,
      tag: `departure-${notificationId(plan, "leave")}`,
    },
  ];
  return notifications;
}

export function notificationDeliveryState(
  at: Date,
  now: Date,
): NotificationDeliveryState {
  const delayMs = at.getTime() - now.getTime();
  if (delayMs > 0) return { status: "future", delayMs };
  if (delayMs >= -NOTIFICATION_CATCH_UP_MS) return { status: "due" };
  return { status: "expired" };
}

function notificationId(plan: DeparturePlan, key: "wake" | "leave"): string {
  return [plan.commitment.id, plan.arriveBy.toISOString(), key].join(":");
}

function studyLabel(plan: DeparturePlan): string {
  return plan.commitment.courseId || plan.commitment.title.replace(/^Study\s+/i, "");
}

function studyBody(plan: DeparturePlan): string {
  const testDate = plan.commitment.study?.testDate;
  const testTitle = plan.commitment.study?.testTitle;
  const testLabel = testTitle ? ` ${testTitle}` : "";
  const dateLabel = testDate ? ` ${shortDate(testDate)}` : "";
  const minutes = plan.commitment.study?.plannedMinutes;
  const duration = minutes ? `${formatDuration(minutes)} session. ` : "";
  return `${duration}Test${testLabel}${dateLabel}.`.replace(/\s+\./, ".");
}

function shortDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

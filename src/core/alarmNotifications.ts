import type { DeparturePlan } from "./types";
import { formatClock } from "./time";

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
  return [
    {
      id: notificationId(plan, "wake"),
      at: plan.wakeBy,
      title: "Time to wake up",
      body: `Leave by ${formatClock(plan.leaveBy)} for ${plan.commitment.title}.`,
      tag: `departure-${notificationId(plan, "wake")}`,
    },
    {
      id: notificationId(plan, "leave"),
      at: plan.leaveBy,
      title: "Time to leave",
      body: `Head to ${plan.commitment.destination.label}. ETA ${formatClock(
        plan.arriveBy,
      )}.`,
      tag: `departure-${notificationId(plan, "leave")}`,
    },
  ];
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

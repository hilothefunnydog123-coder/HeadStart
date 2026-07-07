import { useEffect, useRef } from "react";
import type { DeparturePlan } from "../core/types";
import {
  alarmNotificationsForPlan,
  notificationDeliveryState,
  type AlarmNotification,
} from "../core/alarmNotifications";
import {
  notificationPermission,
  showAlarmNotification,
} from "../core/notifications";

const MAX_TIMEOUT_MS = 2_147_483_647;

export function useAlarmNotifications(
  plan: DeparturePlan | null,
  enabled: boolean,
  now: Date,
): void {
  const sent = useRef<Set<string>>(new Set());
  const scheduleKey = plan
    ? [
        plan.commitment.id,
        plan.commitment.title,
        plan.commitment.destination.label,
        plan.wakeBy.toISOString(),
        plan.leaveBy.toISOString(),
        plan.arriveBy.toISOString(),
      ].join(":")
    : "";

  useEffect(() => {
    if (!enabled || !plan || notificationPermission() !== "granted") return;

    const timers: ReturnType<typeof window.setTimeout>[] = [];
    const schedule = (alert: AlarmNotification, anchor: Date) => {
      const delivery = notificationDeliveryState(alert.at, anchor);
      if (delivery.status === "expired") return;

      if (delivery.status === "due") {
        sendOnce(alert);
        return;
      }

      const delay = Math.min(delivery.delayMs, MAX_TIMEOUT_MS);
      const timer = window.setTimeout(() => {
        if (delivery.delayMs > MAX_TIMEOUT_MS) {
          schedule(alert, new Date());
          return;
        }
        sendOnce(alert);
      }, delay);
      timers.push(timer);
    };

    const sendOnce = (alert: AlarmNotification) => {
      if (sent.current.has(alert.id)) return;
      sent.current.add(alert.id);
      void showAlarmNotification({
        title: alert.title,
        body: alert.body,
        tag: alert.tag,
      });
    };

    for (const alert of alarmNotificationsForPlan(plan)) {
      schedule(alert, now);
    }

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [enabled, scheduleKey]);
}

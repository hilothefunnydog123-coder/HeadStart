import { useEffect, useRef } from "react";
import type { DeparturePlan } from "../core/types";
import { formatClock } from "../core/time";
import {
  notificationPermission,
  showAlarmNotification,
} from "../core/notifications";

const NOTIFICATION_WINDOW_MS = 60_000;

export function useAlarmNotifications(
  plan: DeparturePlan | null,
  enabled: boolean,
  now: Date,
): void {
  const sent = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !plan || notificationPermission() !== "granted") return;

    const alerts = [
      {
        key: "wake",
        at: plan.wakeBy,
        title: "Time to wake up",
        body: `Leave by ${formatClock(plan.leaveBy)} for ${plan.commitment.title}.`,
      },
      {
        key: "leave",
        at: plan.leaveBy,
        title: "Time to leave",
        body: `Head to ${plan.commitment.destination.label}. ETA ${formatClock(
          plan.arriveBy,
        )}.`,
      },
    ];

    for (const alert of alerts) {
      const delta = now.getTime() - alert.at.getTime();
      if (delta < 0 || delta > NOTIFICATION_WINDOW_MS) continue;

      const id = [
        plan.commitment.id,
        plan.arriveBy.toISOString(),
        alert.key,
      ].join(":");
      if (sent.current.has(id)) continue;
      sent.current.add(id);
      void showAlarmNotification({
        title: alert.title,
        body: alert.body,
        tag: `departure-${id}`,
      });
    }
  }, [enabled, now, plan]);
}

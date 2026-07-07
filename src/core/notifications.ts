export type AlarmNotificationPermission = NotificationPermission | "unsupported";

export function notificationPermission(): AlarmNotificationPermission {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

export async function requestAlarmNotificationPermission(): Promise<
  AlarmNotificationPermission
> {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window)) return "unsupported";
  return Notification.requestPermission();
}

export async function registerAlarmServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined") return null;
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

export async function showAlarmNotification({
  title,
  body,
  tag,
}: {
  title: string;
  body: string;
  tag: string;
}): Promise<boolean> {
  if (notificationPermission() !== "granted") return false;
  if (typeof navigator === "undefined") return false;
  const registration = "serviceWorker" in navigator
    ? await navigator.serviceWorker.ready.catch(() => null)
    : null;

  if (registration) {
    await registration.showNotification(title, {
      body,
      tag,
      badge: "/favicon.svg",
      icon: "/favicon.svg",
    });
    return true;
  }

  new Notification(title, { body, tag });
  return true;
}

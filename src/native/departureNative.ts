import { Capacitor, registerPlugin } from "@capacitor/core";
import type { DeparturePlan, Settings } from "../core/types";
import { arrivalBufferMinutesFor } from "../core/departure";
import { hostedTrafficEndpoint, hostedTrafficIsConfiguredForNative } from "../core/traffic/hosted";

export type NativePermissionState =
  | "authorized"
  | "denied"
  | "not-determined"
  | "unavailable";

export interface NativeCapabilities {
  platform: "ios" | "android" | "web";
  native: boolean;
  alarmSupported: boolean;
  alarmAuthorization: NativePermissionState;
  exactAlarmAllowed: boolean;
  notificationAuthorization: NativePermissionState;
  calendarSupported: boolean;
  calendarAuthorization: NativePermissionState;
  backgroundRefreshSupported: boolean;
  liveActivitySupported: boolean;
  widgetsSupported: boolean;
  hostedTrafficConfigured: boolean;
  scheduledAlarmCount?: number;
}

export interface NativeCalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  allDay?: boolean;
  cancelled?: boolean;
  remote?: boolean;
}

export interface NativeVerificationCheck {
  id: string;
  label: string;
  status: "pass" | "warning" | "fail";
  detail: string;
}

export interface NativeVerificationResult {
  scheduled: boolean;
  fireAt?: string;
  checks: NativeVerificationCheck[];
}

export interface NativePlanPayload {
  id: string;
  title: string;
  destinationLabel: string;
  wakeAt: string;
  leaveAt: string;
  arriveAt: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  travelMode: string;
  prepMinutes: number;
  arrivalBufferMinutes: number;
  wakeCushionMinutes: number;
  trafficEndpoint: string;
}

interface DepartureNativePlugin {
  getCapabilities(): Promise<NativeCapabilities>;
  requestAlarmAuthorization(): Promise<NativeCapabilities>;
  schedulePlan(options: NativePlanPayload): Promise<{ scheduled: boolean }>;
  cancelPlan(options: { id?: string }): Promise<void>;
  syncSurface(options: NativePlanPayload): Promise<void>;
  scheduleBackgroundRefresh(options: { earliestAt: string }): Promise<void>;
  requestCalendarAuthorization(): Promise<NativeCapabilities>;
  readCalendarEvents(options: {
    startAt: string;
    endAt: string;
  }): Promise<{ events: NativeCalendarEvent[] }>;
  verifyAlarm(options: { fireAt: string }): Promise<NativeVerificationResult>;
  openSystemSettings(): Promise<void>;
}

const DepartureNative = registerPlugin<DepartureNativePlugin>("DepartureNative");

export function isNativeDepartureApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function nativePlatform(): NativeCapabilities["platform"] {
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android" ? platform : "web";
}

export async function getNativeCapabilities(): Promise<NativeCapabilities> {
  if (!isNativeDepartureApp()) return webCapabilities();
  return DepartureNative.getCapabilities();
}

export async function requestNativeAlarmAuthorization(): Promise<NativeCapabilities> {
  if (!isNativeDepartureApp()) return webCapabilities();
  return DepartureNative.requestAlarmAuthorization();
}

export async function scheduleNativePlan(payload: NativePlanPayload): Promise<boolean> {
  if (!isNativeDepartureApp()) return false;
  const result = await DepartureNative.schedulePlan(payload);
  await Promise.all([
    DepartureNative.syncSurface(payload),
    DepartureNative.scheduleBackgroundRefresh({
      earliestAt: nextBackgroundRefresh(payload).toISOString(),
    }),
  ]);
  return result.scheduled;
}

export async function cancelNativePlan(id: string): Promise<void> {
  if (!isNativeDepartureApp()) return;
  await DepartureNative.cancelPlan({ id });
}

export async function cancelCurrentNativePlan(): Promise<void> {
  if (!isNativeDepartureApp()) return;
  await DepartureNative.cancelPlan({});
}

export async function requestNativeCalendarAuthorization(): Promise<NativeCapabilities> {
  if (!isNativeDepartureApp()) return webCapabilities();
  return DepartureNative.requestCalendarAuthorization();
}

export async function readNativeCalendarEvents(
  startAt: Date,
  endAt: Date,
): Promise<NativeCalendarEvent[]> {
  if (!isNativeDepartureApp()) return [];
  const result = await DepartureNative.readCalendarEvents({
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
  });
  return Array.isArray(result.events) ? result.events : [];
}

export async function verifyNativeAlarm(): Promise<NativeVerificationResult> {
  if (!isNativeDepartureApp()) {
    return {
      scheduled: false,
      checks: [
        {
          id: "native-app",
          label: "Native app installed",
          status: "warning",
          detail: "Open Departure from the iOS or Android app to test an OS alarm.",
        },
      ],
    };
  }
  return DepartureNative.verifyAlarm({
    fireAt: new Date(Date.now() + 10_000).toISOString(),
  });
}

export async function openNativeSystemSettings(): Promise<void> {
  if (!isNativeDepartureApp()) return;
  await DepartureNative.openSystemSettings();
}

export function nativePlanPayload(
  plan: DeparturePlan,
  settings: Settings,
): NativePlanPayload | null {
  if (!settings.home) return null;
  return {
    id: `${plan.commitment.id}:${plan.arriveBy.toISOString()}`,
    title: plan.commitment.title,
    destinationLabel: plan.commitment.destination.label,
    wakeAt: plan.wakeBy.toISOString(),
    leaveAt: plan.leaveBy.toISOString(),
    arriveAt: plan.arriveBy.toISOString(),
    origin: { lat: settings.home.lat, lng: settings.home.lng },
    destination: {
      lat: plan.commitment.destination.lat,
      lng: plan.commitment.destination.lng,
    },
    travelMode: plan.commitment.travelMode,
    prepMinutes: plan.commitment.prepMinutesOverride ?? settings.prepMinutes,
    arrivalBufferMinutes: arrivalBufferMinutesFor(plan.commitment, settings),
    wakeCushionMinutes: settings.wakeAheadMinutes,
    trafficEndpoint: hostedTrafficEndpoint(),
  };
}

function nextBackgroundRefresh(payload: NativePlanPayload): Date {
  const wakeAt = new Date(payload.wakeAt).getTime();
  const minutesUntilWake = (wakeAt - Date.now()) / 60_000;
  const delayMinutes = minutesUntilWake > 180 ? 15 : minutesUntilWake > 30 ? 5 : 1;
  return new Date(Date.now() + delayMinutes * 60_000);
}

function webCapabilities(): NativeCapabilities {
  return {
    platform: "web",
    native: false,
    alarmSupported: false,
    alarmAuthorization: "unavailable",
    exactAlarmAllowed: false,
    notificationAuthorization: "unavailable",
    calendarSupported: false,
    calendarAuthorization: "unavailable",
    backgroundRefreshSupported: false,
    liveActivitySupported: false,
    widgetsSupported: false,
    hostedTrafficConfigured: hostedTrafficIsConfiguredForNative(),
  };
}

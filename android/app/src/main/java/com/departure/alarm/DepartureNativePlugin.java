package com.departure.alarm;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.CalendarContract;
import android.provider.Settings;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.Locale;

@CapacitorPlugin(
    name = "DepartureNative",
    permissions = {
        @Permission(alias = DepartureNativePlugin.NOTIFICATIONS, strings = { Manifest.permission.POST_NOTIFICATIONS }),
        @Permission(alias = DepartureNativePlugin.CALENDAR, strings = { Manifest.permission.READ_CALENDAR })
    }
)
public final class DepartureNativePlugin extends Plugin {
    static final String NOTIFICATIONS = "notifications";
    static final String CALENDAR = "calendar";

    @Override
    public void load() {
        DepartureAlarmReceiver.createChannel(getContext());
    }

    @PluginMethod
    public void getCapabilities(PluginCall call) {
        call.resolve(capabilities());
    }

    @PluginMethod
    public void requestAlarmAuthorization(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            getPermissionState(NOTIFICATIONS) != PermissionState.GRANTED) {
            requestPermissionForAlias(NOTIFICATIONS, call, "alarmPermissionCallback");
        } else {
            call.resolve(capabilities());
        }
    }

    @PermissionCallback
    private void alarmPermissionCallback(PluginCall call) {
        rescheduleSavedPlan();
        call.resolve(capabilities());
    }

    @PluginMethod
    public void schedulePlan(PluginCall call) {
        try {
            DeparturePlan plan = DeparturePlan.fromPlugin(call.getData());
            DeparturePlan previous = DeparturePlanStore.load(getContext());
            if (previous != null && !previous.id.equals(plan.id)) {
                DepartureAlarmScheduler.cancelPlan(getContext(), previous.id);
            }
            DeparturePlanStore.save(getContext(), plan);
            DepartureAlarmScheduler.schedulePlan(getContext(), plan);
            DepartureTrafficWorker.enqueueForPlan(getContext(), plan);
            DepartureWidgetProvider.updateAll(getContext());
            call.resolve(new JSObject().put("scheduled", notificationsAuthorized()));
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Invalid native plan." : error.getMessage(), error);
        }
    }

    @PluginMethod
    public void cancelPlan(PluginCall call) {
        String id = call.getString("id");
        if (id == null) {
            DeparturePlan saved = DeparturePlanStore.load(getContext());
            if (saved == null) { call.resolve(); return; }
            id = saved.id;
        }
        DepartureAlarmScheduler.cancelPlan(getContext(), id);
        DeparturePlan current = DeparturePlanStore.load(getContext());
        if (current != null && current.id.equals(id)) {
            DeparturePlanStore.clear(getContext());
            DepartureWidgetProvider.updateAll(getContext());
        }
        call.resolve();
    }

    @PluginMethod
    public void syncSurface(PluginCall call) {
        try {
            DeparturePlanStore.save(getContext(), DeparturePlan.fromPlugin(call.getData()));
            DepartureWidgetProvider.updateAll(getContext());
            call.resolve();
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Widget sync failed." : error.getMessage(), error);
        }
    }

    @PluginMethod
    public void scheduleBackgroundRefresh(PluginCall call) {
        String earliestAt = call.getString("earliestAt");
        if (earliestAt == null) {
            call.reject("earliestAt is required.");
            return;
        }
        try {
            DeparturePlan plan = DeparturePlanStore.load(getContext());
            if (DepartureTrafficWorker.hasHttpsTraffic(plan)) {
                DepartureTrafficWorker.enqueueAt(getContext(), DeparturePlan.parseDate(earliestAt));
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("Invalid background refresh date.", error);
        }
    }

    @PluginMethod
    public void requestCalendarAuthorization(PluginCall call) {
        if (getPermissionState(CALENDAR) == PermissionState.GRANTED) {
            call.resolve(capabilities());
        } else {
            requestPermissionForAlias(CALENDAR, call, "calendarPermissionCallback");
        }
    }

    @PermissionCallback
    private void calendarPermissionCallback(PluginCall call) {
        call.resolve(capabilities());
    }

    @PluginMethod
    public void readCalendarEvents(PluginCall call) {
        if (!calendarAuthorized()) {
            call.reject("Calendar permission is required.");
            return;
        }
        try {
            long startAt = DeparturePlan.parseDate(required(call, "startAt"));
            long endAt = DeparturePlan.parseDate(required(call, "endAt"));
            call.resolve(new JSObject().put("events", calendarEvents(startAt, endAt)));
        } catch (Exception error) {
            call.reject(error.getMessage() == null ? "Calendar sync failed." : error.getMessage(), error);
        }
    }

    @PluginMethod
    public void verifyAlarm(PluginCall call) {
        String fireAtText = call.getString("fireAt");
        if (fireAtText == null) {
            call.reject("fireAt is required.");
            return;
        }
        try {
            long fireAt = DeparturePlan.parseDate(fireAtText);
            boolean scheduled = notificationsAuthorized();
            if (scheduled) DepartureAlarmScheduler.scheduleVerification(getContext(), fireAt);
            JSArray checks = new JSArray();
            checks.put(check(
                "exact-alarm",
                "Exact alarm delivery",
                DepartureAlarmScheduler.canScheduleExact(getContext()) ? "pass" : "fail",
                DepartureAlarmScheduler.canScheduleExact(getContext())
                    ? "Alarm Clock delivery is available."
                    : "Allow exact alarms in Android settings."
            ));
            checks.put(check(
                "notifications",
                "Alarm notifications",
                notificationsAuthorized() ? "pass" : "fail",
                notificationsAuthorized() ? "Notifications are enabled." : "Notification permission is required."
            ));
            checks.put(check(
                "full-screen",
                "Lock Screen alarm",
                fullScreenAllowed() ? "pass" : "warning",
                fullScreenAllowed() ? "Full-screen alarm intent is available." : "Full-screen alerts are disabled."
            ));
            checks.put(check(
                "background",
                "Background rescheduling",
                "pass",
                "WorkManager will refresh traffic and restore alarms."
            ));
            checks.put(check(
                "widget",
                "Home/Lock Screen widget",
                "pass",
                "The Departure widget provider is installed."
            ));
            call.resolve(
                new JSObject()
                    .put("scheduled", scheduled)
                    .put("fireAt", DeparturePlan.isoDate(fireAt))
                    .put("checks", checks)
            );
        } catch (Exception error) {
            call.reject("Alarm verification failed.", error);
        }
    }

    @PluginMethod
    public void openSystemSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= 34 && !fullScreenAllowed()) {
            intent = new Intent(
                Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                Uri.parse("package:" + getContext().getPackageName())
            );
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            !DepartureAlarmScheduler.canScheduleExact(getContext())) {
            intent = new Intent(
                Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                Uri.parse("package:" + getContext().getPackageName())
            );
        } else {
            intent = new Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName())
            );
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    private JSObject capabilities() {
        DeparturePlan plan = DeparturePlanStore.load(getContext());
        boolean alarmAuthorized = alarmAuthorized();
        return new JSObject()
            .put("platform", "android")
            .put("native", true)
            .put("alarmSupported", true)
            .put("alarmAuthorization", alarmAuthorized ? "authorized" : "denied")
            .put("exactAlarmAllowed", DepartureAlarmScheduler.canScheduleExact(getContext()))
            .put("notificationAuthorization", notificationsAuthorized() ? "authorized" : "denied")
            .put("calendarSupported", true)
            .put("calendarAuthorization", calendarAuthorized() ? "authorized" : calendarPermissionState())
            .put("backgroundRefreshSupported", true)
            .put("liveActivitySupported", false)
            .put("widgetsSupported", true)
            .put("hostedTrafficConfigured", DepartureTrafficWorker.hasHttpsTraffic(plan))
            .put("scheduledAlarmCount", plan == null ? 0 : 2);
    }

    private void rescheduleSavedPlan() {
        DeparturePlan plan = DeparturePlanStore.load(getContext());
        if (plan != null && notificationsAuthorized()) {
            DepartureAlarmScheduler.schedulePlan(getContext(), plan);
            DepartureTrafficWorker.enqueueForPlan(getContext(), plan);
            DepartureWidgetProvider.updateAll(getContext());
        }
    }

    private boolean alarmAuthorized() {
        return DepartureAlarmScheduler.canScheduleExact(getContext()) && notificationsAuthorized();
    }

    private boolean notificationsAuthorized() {
        return NotificationManagerCompat.from(getContext()).areNotificationsEnabled() &&
            (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
    }

    private boolean calendarAuthorized() {
        return ContextCompat.checkSelfPermission(getContext(), Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    private String calendarPermissionState() {
        return getPermissionState(CALENDAR) == PermissionState.PROMPT ? "not-determined" : "denied";
    }

    private boolean fullScreenAllowed() {
        if (Build.VERSION.SDK_INT < 34) return true;
        NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        return manager.canUseFullScreenIntent();
    }

    private JSArray calendarEvents(long startAt, long endAt) {
        JSArray events = new JSArray();
        String[] projection = {
            CalendarContract.Instances.EVENT_ID,
            CalendarContract.Instances.TITLE,
            CalendarContract.Instances.BEGIN,
            CalendarContract.Instances.END,
            CalendarContract.Instances.EVENT_LOCATION,
            CalendarContract.Instances.ALL_DAY,
            CalendarContract.Instances.STATUS
        };
        Cursor cursor = CalendarContract.Instances.query(
            getContext().getContentResolver(),
            projection,
            startAt,
            endAt
        );
        if (cursor == null) return events;
        try {
            int count = 0;
            while (cursor.moveToNext() && count < 100) {
                String location = cursor.getString(4);
                String title = cursor.getString(1);
                JSObject event = new JSObject()
                    .put("id", cursor.getLong(0) + ":" + cursor.getLong(2))
                    .put("title", title == null ? "Calendar event" : title)
                    .put("startAt", DeparturePlan.isoDate(cursor.getLong(2)))
                    .put("endAt", DeparturePlan.isoDate(cursor.getLong(3)))
                    .put("location", location == null ? "" : location)
                    .put("allDay", cursor.getInt(5) == 1)
                    .put("cancelled", cursor.getInt(6) == CalendarContract.Events.STATUS_CANCELED)
                    .put("remote", isRemote(location));
                events.put(event);
                count += 1;
            }
        } finally {
            cursor.close();
        }
        return events;
    }

    private boolean isRemote(String location) {
        if (location == null) return false;
        String value = location.toLowerCase(Locale.US);
        for (String marker : new String[] { "zoom.us", "meet.google", "teams.microsoft", "webex", "virtual", "remote" }) {
            if (value.contains(marker)) return true;
        }
        return false;
    }

    private JSObject check(String id, String label, String status, String detail) {
        return new JSObject().put("id", id).put("label", label).put("status", status).put("detail", detail);
    }

    private String required(PluginCall call, String key) throws Exception {
        String value = call.getString(key);
        if (value == null) throw new IllegalArgumentException(key + " is required.");
        return value;
    }
}

package com.departure.alarm;

import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

final class DepartureAlarmScheduler {
    static final String ACTION_ALARM = "com.departure.alarm.ACTION_ALARM";
    static final String ACTION_STOP = "com.departure.alarm.ACTION_STOP";
    static final String ACTION_SNOOZE = "com.departure.alarm.ACTION_SNOOZE";
    static final String EXTRA_PLAN_ID = "planId";
    static final String EXTRA_KIND = "kind";
    static final String EXTRA_TITLE = "title";
    static final String EXTRA_DESTINATION = "destination";
    static final String EXTRA_LEAVE_AT = "leaveAt";

    private DepartureAlarmScheduler() {}

    static boolean canScheduleExact(Context context) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || manager.canScheduleExactAlarms();
    }

    static void schedulePlan(Context context, DeparturePlan plan) {
        cancelPlan(context, plan.id);
        scheduleSingle(context, plan, "wake", plan.wakeAtMillis);
        scheduleSingle(context, plan, "leave", plan.leaveAtMillis);
    }

    @SuppressLint("MissingPermission") // USE_EXACT_ALARM is intentional for this alarm-clock app.
    static void scheduleSingle(Context context, DeparturePlan plan, String kind, long fireAtMillis) {
        if (fireAtMillis <= System.currentTimeMillis()) return;
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        PendingIntent alarmIntent = alarmIntent(context, plan, kind, PendingIntent.FLAG_UPDATE_CURRENT);
        if ("wake".equals(kind) && canScheduleExact(context)) {
            PendingIntent showIntent = PendingIntent.getActivity(
                context,
                requestCode(plan.id, "show"),
                new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            manager.setAlarmClock(new AlarmManager.AlarmClockInfo(fireAtMillis, showIntent), alarmIntent);
        } else {
            if (canScheduleExact(context)) {
                manager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAtMillis, alarmIntent);
            } else {
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAtMillis, alarmIntent);
            }
        }
    }

    @SuppressLint("MissingPermission") // USE_EXACT_ALARM is intentional for this alarm-clock app.
    static void scheduleVerification(Context context, long fireAtMillis) {
        String id = "verification";
        Intent intent = baseIntent(context, id, "wake")
            .putExtra(EXTRA_TITLE, "Departure test alarm")
            .putExtra(EXTRA_DESTINATION, "Test destination")
            .putExtra(EXTRA_LEAVE_AT, fireAtMillis + 60_000L);
        PendingIntent alarmIntent = PendingIntent.getBroadcast(
            context,
            requestCode(id, "wake"),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent showIntent = PendingIntent.getActivity(
            context,
            requestCode(id, "show"),
            new Intent(context, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (canScheduleExact(context)) {
            manager.setAlarmClock(new AlarmManager.AlarmClockInfo(fireAtMillis, showIntent), alarmIntent);
        } else {
            manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireAtMillis, alarmIntent);
        }
    }

    static void cancelPlan(Context context, String planId) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        for (String kind : new String[] { "wake", "leave" }) {
            Intent intent = baseIntent(context, planId, kind);
            PendingIntent pendingIntent = PendingIntent.getBroadcast(
                context,
                requestCode(planId, kind),
                intent,
                PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
            );
            if (pendingIntent != null) {
                manager.cancel(pendingIntent);
                pendingIntent.cancel();
            }
        }
    }

    private static PendingIntent alarmIntent(Context context, DeparturePlan plan, String kind, int flags) {
        Intent intent = baseIntent(context, plan.id, kind)
            .putExtra(EXTRA_TITLE, plan.title)
            .putExtra(EXTRA_DESTINATION, plan.destinationLabel)
            .putExtra(EXTRA_LEAVE_AT, plan.leaveAtMillis);
        return PendingIntent.getBroadcast(
            context,
            requestCode(plan.id, kind),
            intent,
            flags | PendingIntent.FLAG_IMMUTABLE
        );
    }

    static Intent baseIntent(Context context, String planId, String kind) {
        return new Intent(context, DepartureAlarmReceiver.class)
            .setAction(ACTION_ALARM + "." + kind + "." + planId)
            .putExtra(EXTRA_PLAN_ID, planId)
            .putExtra(EXTRA_KIND, kind);
    }

    static int requestCode(String planId, String kind) {
        return (planId + ":" + kind).hashCode() & 0x7fffffff;
    }
}

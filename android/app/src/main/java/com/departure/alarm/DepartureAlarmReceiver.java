package com.departure.alarm;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.Date;

public final class DepartureAlarmReceiver extends BroadcastReceiver {
    static final String CHANNEL_ID = "departure_alarms";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction() == null ? "" : intent.getAction();
        String planId = intent.getStringExtra(DepartureAlarmScheduler.EXTRA_PLAN_ID);
        if (action.startsWith(DepartureAlarmScheduler.ACTION_STOP)) {
            NotificationManagerCompat.from(context).cancel(notificationId(planId));
            return;
        }
        if (action.startsWith(DepartureAlarmScheduler.ACTION_SNOOZE)) {
            DeparturePlan plan = DeparturePlanStore.load(context);
            if (plan != null) {
                DepartureAlarmScheduler.scheduleSingle(
                    context,
                    plan,
                    "wake",
                    System.currentTimeMillis() + 5 * 60_000L
                );
            }
            NotificationManagerCompat.from(context).cancel(notificationId(planId));
            return;
        }
        showAlarm(context, intent);
    }

    private void showAlarm(Context context, Intent source) {
        createChannel(context);
        String planId = source.getStringExtra(DepartureAlarmScheduler.EXTRA_PLAN_ID);
        String kind = source.getStringExtra(DepartureAlarmScheduler.EXTRA_KIND);
        String destination = source.getStringExtra(DepartureAlarmScheduler.EXTRA_DESTINATION);
        long leaveAt = source.getLongExtra(DepartureAlarmScheduler.EXTRA_LEAVE_AT, 0);
        boolean wake = "wake".equals(kind);
        String title = wake ? "Time to wake up" : "Leave now";
        String body = wake
            ? "Leave for " + safe(destination) + " at " + android.text.format.DateFormat.getTimeFormat(context).format(new Date(leaveAt))
            : "Head to " + safe(destination) + " to arrive on time.";

        Intent activityIntent = new Intent(context, DepartureAlarmActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtras(source);
        PendingIntent fullScreen = PendingIntent.getActivity(
            context,
            DepartureAlarmScheduler.requestCode(planId, kind + ":full"),
            activityIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        PendingIntent stop = actionIntent(context, DepartureAlarmScheduler.ACTION_STOP, planId, kind);
        PendingIntent snooze = actionIntent(context, DepartureAlarmScheduler.ACTION_SNOOZE, planId, kind);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
            .setVibrate(new long[] { 0, 700, 350, 700, 350, 900 })
            .setOngoing(wake)
            .setAutoCancel(!wake)
            .setContentIntent(fullScreen)
            .setFullScreenIntent(fullScreen, true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stop);
        if (wake) {
            builder.addAction(android.R.drawable.ic_popup_sync, "Snooze 5 min", snooze);
        }

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ActivityCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            NotificationManagerCompat.from(context).notify(notificationId(planId), builder.build());
        }
    }

    static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Departure alarms",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Wake and leave alarms for your next commitment");
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 700, 350, 700, 350, 900 });
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        channel.setSound(sound, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build());
        channel.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        manager.createNotificationChannel(channel);
    }

    static int notificationId(String planId) {
        return ("departure-notification:" + safe(planId)).hashCode() & 0x7fffffff;
    }

    private PendingIntent actionIntent(Context context, String action, String planId, String kind) {
        Intent intent = new Intent(context, DepartureAlarmReceiver.class)
            .setAction(action + "." + safe(planId))
            .putExtra(DepartureAlarmScheduler.EXTRA_PLAN_ID, planId)
            .putExtra(DepartureAlarmScheduler.EXTRA_KIND, kind);
        return PendingIntent.getBroadcast(
            context,
            DepartureAlarmScheduler.requestCode(safe(planId), action),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }
}

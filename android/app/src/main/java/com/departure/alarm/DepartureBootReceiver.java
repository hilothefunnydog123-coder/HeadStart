package com.departure.alarm;

import android.app.AlarmManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class DepartureBootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (
            !Intent.ACTION_BOOT_COMPLETED.equals(action) &&
            !Intent.ACTION_MY_PACKAGE_REPLACED.equals(action) &&
            !Intent.ACTION_TIME_CHANGED.equals(action) &&
            !Intent.ACTION_TIMEZONE_CHANGED.equals(action) &&
            !AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED.equals(action)
        ) return;
        DeparturePlan plan = DeparturePlanStore.load(context);
        if (plan == null) return;
        if (plan.arriveAtMillis <= System.currentTimeMillis()) {
            DeparturePlanStore.clear(context);
            DepartureWidgetProvider.updateAll(context);
            return;
        }
        DepartureAlarmScheduler.schedulePlan(context, plan);
        DepartureTrafficWorker.enqueueForPlan(context, plan);
        DepartureWidgetProvider.updateAll(context);
    }
}

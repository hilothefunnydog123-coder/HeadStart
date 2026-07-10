package com.departure.alarm;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.text.format.DateFormat;
import android.widget.RemoteViews;
import java.util.Date;

public final class DepartureWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        for (int id : appWidgetIds) manager.updateAppWidget(id, views(context));
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        ComponentName component = new ComponentName(context, DepartureWidgetProvider.class);
        int[] ids = manager.getAppWidgetIds(component);
        for (int id : ids) manager.updateAppWidget(id, views(context));
    }

    private static RemoteViews views(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.departure_widget);
        DeparturePlan plan = DeparturePlanStore.load(context);
        if (plan == null) {
            views.setTextViewText(R.id.widget_time, "No plan");
            views.setTextViewText(R.id.widget_destination, "Add your next commitment");
            views.setTextViewText(R.id.widget_wake, "Departure");
        } else {
            views.setTextViewText(R.id.widget_time, DateFormat.getTimeFormat(context).format(new Date(plan.leaveAtMillis)));
            views.setTextViewText(R.id.widget_destination, "Leave for " + plan.destinationLabel);
            views.setTextViewText(
                R.id.widget_wake,
                "Wake " + DateFormat.getTimeFormat(context).format(new Date(plan.wakeAtMillis))
            );
        }
        PendingIntent open = PendingIntent.getActivity(
            context,
            0,
            new Intent(context, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        views.setOnClickPendingIntent(R.id.departure_widget_root, open);
        return views;
    }
}

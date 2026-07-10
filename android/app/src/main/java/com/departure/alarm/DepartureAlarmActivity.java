package com.departure.alarm;

import android.app.KeyguardManager;
import android.content.Context;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationManagerCompat;

public final class DepartureAlarmActivity extends AppCompatActivity {
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager manager = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            manager.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }
        setContentView(content());
    }

    private LinearLayout content() {
        String kind = getIntent().getStringExtra(DepartureAlarmScheduler.EXTRA_KIND);
        String planId = getIntent().getStringExtra(DepartureAlarmScheduler.EXTRA_PLAN_ID);
        String destination = getIntent().getStringExtra(DepartureAlarmScheduler.EXTRA_DESTINATION);
        boolean wake = "wake".equals(kind);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(48, 72, 48, 72);
        root.setBackgroundColor(Color.rgb(20, 27, 53));
        root.setLayoutParams(new ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        ));

        String destinationLabel = destination == null
            ? getString(R.string.departure_fallback_destination)
            : destination;
        TextView eyebrow = text(getString(
            wake ? R.string.departure_wake_eyebrow : R.string.departure_leave_eyebrow
        ), 15);
        TextView title = text(getString(
            wake ? R.string.departure_wake_title : R.string.departure_leave_title
        ), 36);
        title.setPadding(0, 24, 0, 16);
        TextView detail = text(getString(
            wake ? R.string.departure_wake_detail : R.string.departure_leave_detail,
            destinationLabel
        ), 18);
        detail.setPadding(0, 0, 0, 44);
        root.addView(eyebrow);
        root.addView(title);
        root.addView(detail);

        Button stop = new Button(this);
        stop.setText(wake ? R.string.departure_stop_alarm : R.string.departure_im_leaving);
        stop.setOnClickListener(view -> {
            NotificationManagerCompat.from(this).cancel(DepartureAlarmReceiver.notificationId(planId));
            finishAndRemoveTask();
        });
        root.addView(stop, new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        if (wake) {
            Button snooze = new Button(this);
            snooze.setText(R.string.departure_snooze);
            snooze.setOnClickListener(view -> {
                DeparturePlan plan = DeparturePlanStore.load(this);
                if (plan != null) {
                    DepartureAlarmScheduler.scheduleSingle(
                        this,
                        plan,
                        "wake",
                        System.currentTimeMillis() + 5 * 60_000L
                    );
                    Toast.makeText(this, R.string.departure_snoozed, Toast.LENGTH_SHORT).show();
                }
                NotificationManagerCompat.from(this).cancel(DepartureAlarmReceiver.notificationId(planId));
                finishAndRemoveTask();
            });
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            );
            params.topMargin = 16;
            root.addView(snooze, params);
        }
        return root;
    }

    private TextView text(String value, int size) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextColor(Color.WHITE);
        view.setTextSize(size);
        view.setGravity(Gravity.CENTER);
        return view;
    }
}

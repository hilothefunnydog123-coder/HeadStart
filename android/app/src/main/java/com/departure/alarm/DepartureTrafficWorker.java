package com.departure.alarm;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.Constraints;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

public final class DepartureTrafficWorker extends Worker {
    private static final String UNIQUE_WORK = "departure-traffic-refresh";

    public DepartureTrafficWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    @NonNull
    @Override
    public Result doWork() {
        DeparturePlan plan = DeparturePlanStore.load(getApplicationContext());
        if (plan == null) return Result.success();
        if (plan.arriveAtMillis <= System.currentTimeMillis()) {
            DeparturePlanStore.clear(getApplicationContext());
            DepartureWidgetProvider.updateAll(getApplicationContext());
            return Result.success();
        }
        try {
            refresh(plan);
            DeparturePlanStore.save(getApplicationContext(), plan);
            DepartureAlarmScheduler.schedulePlan(getApplicationContext(), plan);
            DepartureWidgetProvider.updateAll(getApplicationContext());
            enqueueForPlan(getApplicationContext(), plan);
            return Result.success();
        } catch (Exception error) {
            enqueueForPlan(getApplicationContext(), plan);
            return Result.success();
        }
    }

    static void enqueueAt(Context context, long earliestAtMillis) {
        long delay = Math.max(0, earliestAtMillis - System.currentTimeMillis());
        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(DepartureTrafficWorker.class)
            .setConstraints(constraints)
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .build();
        WorkManager.getInstance(context).enqueueUniqueWork(
            UNIQUE_WORK,
            ExistingWorkPolicy.REPLACE,
            request
        );
    }

    static void enqueueForPlan(Context context, DeparturePlan plan) {
        if (!hasHttpsTraffic(plan) || plan.arriveAtMillis <= System.currentTimeMillis()) return;
        long minutesUntilWake = (plan.wakeAtMillis - System.currentTimeMillis()) / 60_000;
        long delayMinutes = minutesUntilWake > 180 ? 15 : (minutesUntilWake > 30 ? 5 : 1);
        enqueueAt(context, System.currentTimeMillis() + delayMinutes * 60_000);
    }

    static boolean hasHttpsTraffic(DeparturePlan plan) {
        return plan != null && plan.trafficEndpoint != null && plan.trafficEndpoint.startsWith("https://");
    }

    private void refresh(DeparturePlan plan) throws Exception {
        if (!hasHttpsTraffic(plan)) throw new IllegalArgumentException("HTTPS traffic endpoint required");
        URL url = new URL(plan.trafficEndpoint);
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connection.setRequestMethod("POST");
        connection.setConnectTimeout(12_000);
        connection.setReadTimeout(12_000);
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        JSONObject body = new JSONObject()
            .put("origin", new JSONObject().put("lat", plan.originLatitude).put("lng", plan.originLongitude))
            .put("destination", new JSONObject().put("lat", plan.destinationLatitude).put("lng", plan.destinationLongitude))
            .put("mode", plan.travelMode)
            .put("departAt", DeparturePlan.isoDate(plan.leaveAtMillis));
        try (OutputStream output = connection.getOutputStream()) {
            output.write(body.toString().getBytes(StandardCharsets.UTF_8));
        }
        int status = connection.getResponseCode();
        if (status < 200 || status >= 300) throw new IllegalStateException("Traffic request failed: " + status);
        String payload = read(connection.getInputStream());
        double durationSeconds = new JSONObject(payload).getDouble("durationSeconds");
        if (durationSeconds <= 0) throw new IllegalStateException("Invalid traffic duration");
        plan.leaveAtMillis = plan.arriveAtMillis - Math.round(durationSeconds * 1000) - plan.arrivalBufferMinutes * 60_000L;
        plan.wakeAtMillis = plan.leaveAtMillis - (plan.prepMinutes + plan.wakeCushionMinutes) * 60_000L;
        connection.disconnect();
    }

    private String read(InputStream stream) throws Exception {
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }
}

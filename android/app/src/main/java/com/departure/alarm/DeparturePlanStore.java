package com.departure.alarm;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.annotation.Nullable;

final class DeparturePlanStore {
    private static final String PREFERENCES = "departure_native";
    private static final String CURRENT_PLAN = "current_plan";

    private DeparturePlanStore() {}

    static void save(Context context, DeparturePlan plan) throws Exception {
        preferences(context).edit().putString(CURRENT_PLAN, plan.toJson()).apply();
    }

    @Nullable
    static DeparturePlan load(Context context) {
        String json = preferences(context).getString(CURRENT_PLAN, null);
        if (json == null) return null;
        try {
            return DeparturePlan.fromJson(json);
        } catch (Exception ignored) {
            return null;
        }
    }

    static void clear(Context context) {
        preferences(context).edit().remove(CURRENT_PLAN).apply();
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }
}

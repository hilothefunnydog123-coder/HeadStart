package com.departure.alarm;

import com.getcapacitor.JSObject;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONException;
import org.json.JSONObject;

final class DeparturePlan {
    final String id;
    final String title;
    final String destinationLabel;
    long wakeAtMillis;
    long leaveAtMillis;
    final long arriveAtMillis;
    final double originLatitude;
    final double originLongitude;
    final double destinationLatitude;
    final double destinationLongitude;
    final String travelMode;
    final int prepMinutes;
    final int arrivalBufferMinutes;
    final int wakeCushionMinutes;
    final String trafficEndpoint;

    private DeparturePlan(
        String id,
        String title,
        String destinationLabel,
        long wakeAtMillis,
        long leaveAtMillis,
        long arriveAtMillis,
        double originLatitude,
        double originLongitude,
        double destinationLatitude,
        double destinationLongitude,
        String travelMode,
        int prepMinutes,
        int arrivalBufferMinutes,
        int wakeCushionMinutes,
        String trafficEndpoint
    ) {
        this.id = id;
        this.title = title;
        this.destinationLabel = destinationLabel;
        this.wakeAtMillis = wakeAtMillis;
        this.leaveAtMillis = leaveAtMillis;
        this.arriveAtMillis = arriveAtMillis;
        this.originLatitude = originLatitude;
        this.originLongitude = originLongitude;
        this.destinationLatitude = destinationLatitude;
        this.destinationLongitude = destinationLongitude;
        this.travelMode = travelMode;
        this.prepMinutes = prepMinutes;
        this.arrivalBufferMinutes = arrivalBufferMinutes;
        this.wakeCushionMinutes = wakeCushionMinutes;
        this.trafficEndpoint = trafficEndpoint;
    }

    static DeparturePlan fromPlugin(JSObject value) throws JSONException, ParseException {
        JSObject origin = value.getJSObject("origin");
        JSObject destination = value.getJSObject("destination");
        if (origin == null || destination == null) throw new JSONException("Coordinates are required.");
        return new DeparturePlan(
            required(value, "id"),
            required(value, "title"),
            required(value, "destinationLabel"),
            parseDate(required(value, "wakeAt")),
            parseDate(required(value, "leaveAt")),
            parseDate(required(value, "arriveAt")),
            origin.getDouble("lat"),
            origin.getDouble("lng"),
            destination.getDouble("lat"),
            destination.getDouble("lng"),
            required(value, "travelMode"),
            value.getInt("prepMinutes"),
            value.getInt("arrivalBufferMinutes"),
            value.getInt("wakeCushionMinutes"),
            required(value, "trafficEndpoint")
        );
    }

    static DeparturePlan fromJson(String json) throws JSONException {
        JSONObject value = new JSONObject(json);
        return new DeparturePlan(
            value.getString("id"),
            value.getString("title"),
            value.getString("destinationLabel"),
            value.getLong("wakeAtMillis"),
            value.getLong("leaveAtMillis"),
            value.getLong("arriveAtMillis"),
            value.getDouble("originLatitude"),
            value.getDouble("originLongitude"),
            value.getDouble("destinationLatitude"),
            value.getDouble("destinationLongitude"),
            value.getString("travelMode"),
            value.getInt("prepMinutes"),
            value.getInt("arrivalBufferMinutes"),
            value.getInt("wakeCushionMinutes"),
            value.getString("trafficEndpoint")
        );
    }

    String toJson() throws JSONException {
        return new JSONObject()
            .put("id", id)
            .put("title", title)
            .put("destinationLabel", destinationLabel)
            .put("wakeAtMillis", wakeAtMillis)
            .put("leaveAtMillis", leaveAtMillis)
            .put("arriveAtMillis", arriveAtMillis)
            .put("originLatitude", originLatitude)
            .put("originLongitude", originLongitude)
            .put("destinationLatitude", destinationLatitude)
            .put("destinationLongitude", destinationLongitude)
            .put("travelMode", travelMode)
            .put("prepMinutes", prepMinutes)
            .put("arrivalBufferMinutes", arrivalBufferMinutes)
            .put("wakeCushionMinutes", wakeCushionMinutes)
            .put("trafficEndpoint", trafficEndpoint)
            .toString();
    }

    static long parseDate(String value) throws ParseException {
        ParseException last = null;
        for (String pattern : new String[] {
            "yyyy-MM-dd'T'HH:mm:ss.SSSX",
            "yyyy-MM-dd'T'HH:mm:ssX",
            "yyyy-MM-dd'T'HH:mm:ss.SSSXXX",
            "yyyy-MM-dd'T'HH:mm:ssXXX"
        }) {
            try {
                SimpleDateFormat formatter = new SimpleDateFormat(pattern, Locale.US);
                formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
                formatter.setLenient(false);
                Date date = formatter.parse(value);
                if (date != null) return date.getTime();
            } catch (ParseException error) {
                last = error;
            }
        }
        throw last == null ? new ParseException("Invalid date", 0) : last;
    }

    static String isoDate(long millis) {
        SimpleDateFormat formatter = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        formatter.setTimeZone(TimeZone.getTimeZone("UTC"));
        return formatter.format(new Date(millis));
    }

    private static String required(JSObject value, String key) throws JSONException {
        String result = value.getString(key);
        if (result == null || result.trim().isEmpty()) throw new JSONException(key + " is required.");
        return result;
    }
}

import ActivityKit
import AlarmKit
import BackgroundTasks
import CoreLocation
import EventKit
import Foundation
import SwiftUI
import UIKit
import UserNotifications
import WidgetKit

final class DepartureNativeCoordinator {
    static let shared = DepartureNativeCoordinator()

    private let notifications = UNUserNotificationCenter.current()
    private let eventStore = EKEventStore()
    private let isoFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private init() {}

    func parsePlan(_ call: [AnyHashable: Any]) throws -> DepartureSurfacePlan {
        guard
            let id = call["id"] as? String,
            let title = call["title"] as? String,
            let destinationLabel = call["destinationLabel"] as? String,
            let wakeAtText = call["wakeAt"] as? String,
            let leaveAtText = call["leaveAt"] as? String,
            let arriveAtText = call["arriveAt"] as? String,
            let wakeAt = parseDate(wakeAtText),
            let leaveAt = parseDate(leaveAtText),
            let arriveAt = parseDate(arriveAtText),
            let origin = call["origin"] as? [String: Any],
            let destination = call["destination"] as? [String: Any],
            let originLatitude = number(origin["lat"]),
            let originLongitude = number(origin["lng"]),
            let destinationLatitude = number(destination["lat"]),
            let destinationLongitude = number(destination["lng"]),
            let travelMode = call["travelMode"] as? String,
            let prepMinutes = integer(call["prepMinutes"]),
            let arrivalBufferMinutes = integer(call["arrivalBufferMinutes"]),
            let wakeCushionMinutes = integer(call["wakeCushionMinutes"]),
            let trafficEndpoint = call["trafficEndpoint"] as? String
        else {
            throw DepartureNativeError.invalidPlan
        }

        return DepartureSurfacePlan(
            id: id,
            title: title,
            destinationLabel: destinationLabel,
            wakeAt: wakeAt,
            leaveAt: leaveAt,
            arriveAt: arriveAt,
            originLatitude: originLatitude,
            originLongitude: originLongitude,
            destinationLatitude: destinationLatitude,
            destinationLongitude: destinationLongitude,
            travelMode: travelMode,
            prepMinutes: prepMinutes,
            arrivalBufferMinutes: arrivalBufferMinutes,
            wakeCushionMinutes: wakeCushionMinutes,
            trafficEndpoint: trafficEndpoint
        )
    }

    func capabilities() async -> [String: Any] {
        let notificationSettings = await notifications.notificationSettings()
        let backgroundRefreshAvailable = await MainActor.run {
            UIApplication.shared.backgroundRefreshStatus == .available
        }
        let notificationState = permissionState(notificationSettings.authorizationStatus)
        let alarmState: String
        let exactAlarmAllowed: Bool
        var alarmCount = 0

        if #available(iOS 26.0, *) {
            alarmState = permissionState(AlarmManager.shared.authorizationState)
            exactAlarmAllowed = AlarmManager.shared.authorizationState == .authorized
            if let current = DepartureSharedStore.load() {
                let alarmKitScheduled = (try? AlarmManager.shared.alarms.contains {
                    $0.id == stableUUID(current.id)
                }) ?? false
                let fallbackScheduled = await notifications.pendingNotificationRequests().contains {
                    $0.identifier == wakeNotificationIdentifier(current.id)
                }
                alarmCount = alarmKitScheduled || fallbackScheduled ? 1 : 0
            }
        } else {
            alarmState = notificationState
            exactAlarmAllowed = false
            if let current = DepartureSharedStore.load() {
                let expected = wakeNotificationIdentifier(current.id)
                alarmCount = await notifications.pendingNotificationRequests().contains {
                    $0.identifier == expected
                } ? 1 : 0
            }
        }

        return [
            "platform": "ios",
            "native": true,
            "alarmSupported": true,
            "alarmAuthorization": alarmState,
            "exactAlarmAllowed": exactAlarmAllowed,
            "notificationAuthorization": notificationState,
            "calendarSupported": true,
            "calendarAuthorization": calendarPermissionState(),
            "backgroundRefreshSupported": backgroundRefreshAvailable,
            "liveActivitySupported": liveActivitiesSupported(),
            "widgetsSupported": true,
            "hostedTrafficConfigured": hostedTrafficConfigured(),
            "scheduledAlarmCount": alarmCount
        ]
    }

    func requestAlarmAuthorization() async throws -> [String: Any] {
        _ = try await notifications.requestAuthorization(options: [.alert, .badge, .sound])
        if #available(iOS 26.0, *) {
            _ = try await AlarmManager.shared.requestAuthorization()
        }
        if let plan = DepartureSharedStore.load() {
            _ = try await schedule(plan)
        }
        return await capabilities()
    }

    @discardableResult
    func schedule(_ plan: DepartureSurfacePlan) async throws -> Bool {
        if let previous = DepartureSharedStore.load(), previous.id != plan.id {
            await cancel(planId: previous.id)
        }
        try DepartureSharedStore.save(plan)
        let scheduled: Bool
        if #available(iOS 26.0, *) {
            if AlarmManager.shared.authorizationState == .authorized {
                let id = stableUUID(plan.id)
                try? AlarmManager.shared.cancel(id: id)
                let stopButton = AlarmButton(
                    text: "Stop",
                    textColor: .white,
                    systemImageName: "stop.circle.fill"
                )
                let presentation = AlarmPresentation(
                    alert: AlarmPresentation.Alert(
                        title: "Time to wake up",
                        stopButton: stopButton
                    )
                )
                let metadata = DepartureAlarmMetadata(
                    planId: plan.id,
                    title: plan.title,
                    destinationLabel: plan.destinationLabel,
                    leaveAt: plan.leaveAt
                )
                let attributes = AlarmAttributes(
                    presentation: presentation,
                    metadata: metadata,
                    tintColor: Color(red: 0.18, green: 0.32, blue: 0.68)
                )
                let configuration = AlarmManager.AlarmConfiguration<DepartureAlarmMetadata>.alarm(
                    schedule: .fixed(plan.wakeAt),
                    attributes: attributes,
                    sound: .default
                )
                _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
                scheduled = true
            } else {
                let settings = await notifications.notificationSettings()
                guard settings.authorizationStatus == .authorized else { return false }
                try await scheduleNotification(
                    identifier: wakeNotificationIdentifier(plan.id),
                    title: "Time to wake up",
                    body: "Leave for \(plan.destinationLabel) by \(clock(plan.leaveAt)).",
                    at: plan.wakeAt,
                    interruptionLevel: .timeSensitive
                )
                scheduled = true
            }
        } else {
            let settings = await notifications.notificationSettings()
            guard settings.authorizationStatus == .authorized else { return false }
            try await scheduleNotification(
                identifier: wakeNotificationIdentifier(plan.id),
                title: "Time to wake up",
                body: "Leave for \(plan.destinationLabel) by \(clock(plan.leaveAt)).",
                at: plan.wakeAt,
                interruptionLevel: .timeSensitive
            )
            scheduled = true
        }

        try await scheduleNotification(
            identifier: leaveNotificationIdentifier(plan.id),
            title: "Leave now",
            body: "Head to \(plan.destinationLabel) to arrive on time.",
            at: plan.leaveAt,
            interruptionLevel: .timeSensitive
        )
        await syncSurface(plan)
        return scheduled
    }

    func cancel(planId: String) async {
        notifications.removePendingNotificationRequests(withIdentifiers: [
            wakeNotificationIdentifier(planId),
            leaveNotificationIdentifier(planId)
        ])
        if #available(iOS 26.0, *) {
            try? AlarmManager.shared.cancel(id: stableUUID(planId))
        }
        if DepartureSharedStore.load()?.id == planId {
            DepartureSharedStore.clear()
            WidgetCenter.shared.reloadAllTimelines()
        }
        if #available(iOS 16.2, *) {
            for activity in Activity<DepartureActivityAttributes>.activities
            where activity.attributes.planId == planId {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    func syncSurface(_ plan: DepartureSurfacePlan) async {
        try? DepartureSharedStore.save(plan)
        WidgetCenter.shared.reloadAllTimelines()
        guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else {
            return
        }
        let content = ActivityContent(
            state: activityState(for: plan),
            staleDate: plan.leaveAt.addingTimeInterval(30 * 60)
        )
        if let existing = Activity<DepartureActivityAttributes>.activities.first(where: {
            $0.attributes.planId == plan.id
        }) {
            await existing.update(content)
            return
        }
        for activity in Activity<DepartureActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        let attributes = DepartureActivityAttributes(
            planId: plan.id,
            title: plan.title,
            destinationLabel: plan.destinationLabel
        )
        _ = try? Activity.request(attributes: attributes, content: content, pushType: nil)
    }

    func refreshPlanFromTraffic() async throws {
        guard var plan = DepartureSharedStore.load() else { return }
        guard let endpoint = URL(string: plan.trafficEndpoint), endpoint.scheme == "https" else {
            throw DepartureNativeError.invalidTrafficEndpoint
        }
        var request = URLRequest(url: endpoint)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "origin": ["lat": plan.originLatitude, "lng": plan.originLongitude],
            "destination": ["lat": plan.destinationLatitude, "lng": plan.destinationLongitude],
            "mode": plan.travelMode,
            "departAt": isoFormatter.string(from: plan.leaveAt)
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw DepartureNativeError.trafficUnavailable
        }
        guard
            let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
            let durationSeconds = number(payload["durationSeconds"]),
            durationSeconds > 0
        else {
            throw DepartureNativeError.trafficUnavailable
        }
        let leaveLead = durationSeconds + Double(plan.arrivalBufferMinutes * 60)
        plan.leaveAt = plan.arriveAt.addingTimeInterval(-leaveLead)
        let wakeLead = Double((plan.prepMinutes + plan.wakeCushionMinutes) * 60)
        plan.wakeAt = plan.leaveAt.addingTimeInterval(-wakeLead)
        _ = try await schedule(plan)
    }

    func requestCalendarAuthorization() async throws -> [String: Any] {
        if #available(iOS 17.0, *) {
            _ = try await eventStore.requestFullAccessToEvents()
        } else {
            _ = try await withCheckedThrowingContinuation { continuation in
                eventStore.requestAccess(to: .event) { granted, error in
                    if let error {
                        continuation.resume(throwing: error)
                    } else {
                        continuation.resume(returning: granted)
                    }
                }
            } as Bool
        }
        return await capabilities()
    }

    func calendarEvents(startAt: Date, endAt: Date) -> [[String: Any]] {
        guard calendarPermissionState() == "authorized" else { return [] }
        let predicate = eventStore.predicateForEvents(withStart: startAt, end: endAt, calendars: nil)
        return eventStore.events(matching: predicate).prefix(100).map { event in
            var result: [String: Any] = [
                "id": event.eventIdentifier ?? event.calendarItemIdentifier,
                "title": event.title ?? "Calendar event",
                "startAt": isoFormatter.string(from: event.startDate),
                "endAt": isoFormatter.string(from: event.endDate),
                "allDay": event.isAllDay,
                "cancelled": event.status == .canceled,
                "remote": isRemoteEvent(event)
            ]
            if let location = event.location, !location.isEmpty {
                result["location"] = location
            }
            if let coordinate = event.structuredLocation?.geoLocation?.coordinate {
                result["latitude"] = coordinate.latitude
                result["longitude"] = coordinate.longitude
            }
            return result
        }
    }

    func verifyAlarm(fireAt: Date) async -> [String: Any] {
        var checks: [[String: Any]] = []
        var scheduled = false
        let backgroundRefreshAvailable = await MainActor.run {
            UIApplication.shared.backgroundRefreshStatus == .available
        }
        do {
            if #available(iOS 26.0, *) {
                guard AlarmManager.shared.authorizationState == .authorized else {
                    throw DepartureNativeError.permissionRequired
                }
                let id = stableUUID("departure-verification")
                try? AlarmManager.shared.cancel(id: id)
                let stopButton = AlarmButton(
                    text: "Stop",
                    textColor: .white,
                    systemImageName: "stop.circle.fill"
                )
                let presentation = AlarmPresentation(
                    alert: AlarmPresentation.Alert(
                        title: "Departure test alarm",
                        stopButton: stopButton
                    )
                )
                let metadata = DepartureAlarmMetadata(
                    planId: "departure-verification",
                    title: "Departure test alarm",
                    destinationLabel: "Test destination",
                    leaveAt: fireAt.addingTimeInterval(60)
                )
                let attributes = AlarmAttributes(
                    presentation: presentation,
                    metadata: metadata,
                    tintColor: Color(red: 0.18, green: 0.32, blue: 0.68)
                )
                let configuration = AlarmManager.AlarmConfiguration<DepartureAlarmMetadata>.alarm(
                    schedule: .fixed(fireAt),
                    attributes: attributes,
                    sound: .default
                )
                _ = try await AlarmManager.shared.schedule(id: id, configuration: configuration)
                scheduled = true
                checks.append(check("alarmkit", "AlarmKit delivery", "pass", "A system alarm was accepted by AlarmKit."))
            } else {
                let settings = await notifications.notificationSettings()
                guard settings.authorizationStatus == .authorized else {
                    throw DepartureNativeError.permissionRequired
                }
                try await scheduleNotification(
                    identifier: "departure.verification",
                    title: "Departure test alarm",
                    body: "Native notification delivery is working.",
                    at: fireAt,
                    interruptionLevel: .timeSensitive
                )
                scheduled = true
                checks.append(check("notification", "Native notification", "pass", "A system notification was scheduled."))
            }
        } catch {
            checks.append(check("alarm", "Native alarm", "fail", error.localizedDescription))
        }
        checks.append(check(
            "background",
            "Background refresh",
            backgroundRefreshAvailable ? "pass" : "warning",
            backgroundRefreshAvailable
                ? "Background traffic refresh is available."
                : "Background App Refresh is disabled."
        ))
        checks.append(check(
            "surface",
            "Lock Screen surface",
            liveActivitiesSupported() ? "pass" : "warning",
            liveActivitiesSupported() ? "Live Activities are available." : "Live Activities are unavailable or disabled."
        ))
        return [
            "scheduled": scheduled,
            "fireAt": isoFormatter.string(from: fireAt),
            "checks": checks
        ]
    }

    func parseDate(_ value: String) -> Date? {
        if let date = isoFormatter.date(from: value) { return date }
        return ISO8601DateFormatter().date(from: value)
    }

    private func scheduleNotification(
        identifier: String,
        title: String,
        body: String,
        at date: Date,
        interruptionLevel: UNNotificationInterruptionLevel
    ) async throws {
        guard date > Date() else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.interruptionLevel = interruptionLevel
        let components = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: date
        )
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        try await notifications.add(UNNotificationRequest(
            identifier: identifier,
            content: content,
            trigger: trigger
        ))
    }

    private func activityState(for plan: DepartureSurfacePlan) -> DepartureActivityAttributes.ContentState {
        let now = Date()
        let phase = now < plan.wakeAt ? "Wake" : (now < plan.leaveAt ? "Get ready" : "Leave now")
        return .init(wakeAt: plan.wakeAt, leaveAt: plan.leaveAt, arriveAt: plan.arriveAt, phase: phase)
    }

    private func hostedTrafficConfigured() -> Bool {
        guard let endpoint = DepartureSharedStore.load()?.trafficEndpoint,
              let url = URL(string: endpoint) else { return false }
        return url.scheme == "https"
    }

    private func liveActivitiesSupported() -> Bool {
        guard #available(iOS 16.1, *) else { return false }
        return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    private func calendarPermissionState() -> String {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *), status == .fullAccess { return "authorized" }
        switch status {
        case .authorized: return "authorized"
        case .denied, .restricted, .writeOnly: return "denied"
        case .notDetermined: return "not-determined"
        case .fullAccess: return "authorized"
        @unknown default: return "unavailable"
        }
    }

    private func permissionState(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .authorized, .provisional, .ephemeral: return "authorized"
        case .denied: return "denied"
        case .notDetermined: return "not-determined"
        @unknown default: return "unavailable"
        }
    }

    @available(iOS 26.0, *)
    private func permissionState(_ status: AlarmManager.AuthorizationState) -> String {
        switch status {
        case .authorized: return "authorized"
        case .denied: return "denied"
        case .notDetermined: return "not-determined"
        @unknown default: return "unavailable"
        }
    }

    private func isRemoteEvent(_ event: EKEvent) -> Bool {
        let text = [event.location, event.url?.absoluteString, event.notes]
            .compactMap { $0?.lowercased() }
            .joined(separator: " ")
        return ["zoom.us", "meet.google", "teams.microsoft", "webex", "remote", "virtual"]
            .contains { text.contains($0) }
    }

    private func number(_ value: Any?) -> Double? {
        if let value = value as? NSNumber { return value.doubleValue }
        return value as? Double
    }

    private func integer(_ value: Any?) -> Int? {
        if let value = value as? NSNumber { return value.intValue }
        return value as? Int
    }

    private func stableUUID(_ value: String) -> UUID {
        var bytes = [UInt8](repeating: 0, count: 16)
        for (index, byte) in value.utf8.enumerated() {
            let offset = index % 16
            bytes[offset] = bytes[offset] &+ byte &+ UInt8(index & 0xff)
        }
        bytes[6] = (bytes[6] & 0x0f) | 0x40
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        return UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11], bytes[12], bytes[13], bytes[14], bytes[15]
        ))
    }

    private func wakeNotificationIdentifier(_ id: String) -> String { "departure.wake.\(id)" }
    private func leaveNotificationIdentifier(_ id: String) -> String { "departure.leave.\(id)" }
    private func clock(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }
    private func check(_ id: String, _ label: String, _ status: String, _ detail: String) -> [String: Any] {
        ["id": id, "label": label, "status": status, "detail": detail]
    }
}

enum DepartureNativeError: LocalizedError {
    case invalidPlan
    case invalidTrafficEndpoint
    case permissionRequired
    case trafficUnavailable

    var errorDescription: String? {
        switch self {
        case .invalidPlan: return "The departure plan is incomplete."
        case .invalidTrafficEndpoint: return "An HTTPS hosted traffic endpoint is required."
        case .permissionRequired: return "Native alarm permission is required."
        case .trafficUnavailable: return "Hosted traffic is temporarily unavailable."
        }
    }
}

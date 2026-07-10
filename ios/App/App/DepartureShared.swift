import Foundation
import ActivityKit
import AlarmKit

let departureAppGroup = "group.com.departure.alarm"
let departureBackgroundTaskIdentifier = "com.departure.alarm.refresh"

struct DepartureSurfacePlan: Codable, Hashable {
    let id: String
    let title: String
    let destinationLabel: String
    var wakeAt: Date
    var leaveAt: Date
    let arriveAt: Date
    let originLatitude: Double
    let originLongitude: Double
    let destinationLatitude: Double
    let destinationLongitude: Double
    let travelMode: String
    let prepMinutes: Int
    let arrivalBufferMinutes: Int
    let wakeCushionMinutes: Int
    let trafficEndpoint: String
}

struct DepartureActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        let wakeAt: Date
        let leaveAt: Date
        let arriveAt: Date
        let phase: String
    }

    let planId: String
    let title: String
    let destinationLabel: String
}

@available(iOS 26.0, *)
struct DepartureAlarmMetadata: AlarmMetadata {
    let planId: String
    let title: String
    let destinationLabel: String
    let leaveAt: Date
}

enum DepartureSharedStore {
    static let planKey = "departure.currentPlan"

    static var defaults: UserDefaults {
        UserDefaults(suiteName: departureAppGroup) ?? .standard
    }

    static func save(_ plan: DepartureSurfacePlan) throws {
        let data = try JSONEncoder().encode(plan)
        defaults.set(data, forKey: planKey)
    }

    static func load() -> DepartureSurfacePlan? {
        guard let data = defaults.data(forKey: planKey) else { return nil }
        return try? JSONDecoder().decode(DepartureSurfacePlan.self, from: data)
    }

    static func clear() {
        defaults.removeObject(forKey: planKey)
    }
}

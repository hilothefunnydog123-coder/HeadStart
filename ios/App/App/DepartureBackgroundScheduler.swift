import BackgroundTasks
import Foundation

enum DepartureBackgroundScheduler {
    static func register() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: departureBackgroundTaskIdentifier,
            using: nil
        ) { task in
            guard let processingTask = task as? BGProcessingTask else {
                task.setTaskCompleted(success: false)
                return
            }
            handle(processingTask)
        }
    }

    static func schedule(earliestAt: Date) throws {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: departureBackgroundTaskIdentifier)
        let request = BGProcessingTaskRequest(identifier: departureBackgroundTaskIdentifier)
        request.requiresNetworkConnectivity = true
        request.requiresExternalPower = false
        request.earliestBeginDate = earliestAt
        try BGTaskScheduler.shared.submit(request)
    }

    static func scheduleForCurrentPlan() {
        guard
            let plan = DepartureSharedStore.load(),
            let endpoint = URL(string: plan.trafficEndpoint),
            endpoint.scheme == "https"
        else { return }
        try? schedule(earliestAt: nextRefreshDate(for: plan, now: Date()))
    }

    static func nextRefreshDate(for plan: DepartureSurfacePlan, now: Date) -> Date {
        let minutesUntilWake = plan.wakeAt.timeIntervalSince(now) / 60
        let delayMinutes: Double = minutesUntilWake > 180 ? 15 : (minutesUntilWake > 30 ? 5 : 1)
        return now.addingTimeInterval(delayMinutes * 60)
    }

    private static func handle(_ task: BGProcessingTask) {
        let operation = Task {
            do {
                try await DepartureNativeCoordinator.shared.refreshPlanFromTraffic()
                scheduleForCurrentPlan()
                task.setTaskCompleted(success: true)
            } catch {
                scheduleForCurrentPlan()
                task.setTaskCompleted(success: false)
            }
        }
        task.expirationHandler = {
            operation.cancel()
        }
    }
}

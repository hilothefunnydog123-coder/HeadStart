import Capacitor
import UIKit

@objc(DepartureNativePlugin)
final class DepartureNativePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "DepartureNativePlugin"
    let jsName = "DepartureNative"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getCapabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlarmAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "schedulePlan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelPlan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncSurface", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleBackgroundRefresh", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestCalendarAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readCalendarEvents", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "verifyAlarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSystemSettings", returnType: CAPPluginReturnPromise)
    ]

    @objc func getCapabilities(_ call: CAPPluginCall) {
        Task { call.resolve(await DepartureNativeCoordinator.shared.capabilities()) }
    }

    @objc func requestAlarmAuthorization(_ call: CAPPluginCall) {
        Task {
            do { call.resolve(try await DepartureNativeCoordinator.shared.requestAlarmAuthorization()) }
            catch { call.reject(error.localizedDescription, nil, error) }
        }
    }

    @objc func schedulePlan(_ call: CAPPluginCall) {
        Task {
            do {
                let plan = try DepartureNativeCoordinator.shared.parsePlan(call.options)
                let scheduled = try await DepartureNativeCoordinator.shared.schedule(plan)
                call.resolve(["scheduled": scheduled])
            } catch {
                call.reject(error.localizedDescription, nil, error)
            }
        }
    }

    @objc func cancelPlan(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? DepartureSharedStore.load()?.id
        guard let id else { call.resolve(); return }
        Task {
            await DepartureNativeCoordinator.shared.cancel(planId: id)
            call.resolve()
        }
    }

    @objc func syncSurface(_ call: CAPPluginCall) {
        Task {
            do {
                let plan = try DepartureNativeCoordinator.shared.parsePlan(call.options)
                await DepartureNativeCoordinator.shared.syncSurface(plan)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription, nil, error)
            }
        }
    }

    @objc func scheduleBackgroundRefresh(_ call: CAPPluginCall) {
        guard
            let earliestAt = call.getString("earliestAt"),
            let date = DepartureNativeCoordinator.shared.parseDate(earliestAt)
        else {
            call.reject("A valid earliestAt date is required.")
            return
        }
        guard
            let endpoint = DepartureSharedStore.load()?.trafficEndpoint,
            URL(string: endpoint)?.scheme == "https"
        else {
            call.resolve()
            return
        }
        do {
            try DepartureBackgroundScheduler.schedule(earliestAt: date)
            call.resolve()
        } catch {
            call.reject(error.localizedDescription, nil, error)
        }
    }

    @objc func requestCalendarAuthorization(_ call: CAPPluginCall) {
        Task {
            do { call.resolve(try await DepartureNativeCoordinator.shared.requestCalendarAuthorization()) }
            catch { call.reject(error.localizedDescription, nil, error) }
        }
    }

    @objc func readCalendarEvents(_ call: CAPPluginCall) {
        guard
            let startText = call.getString("startAt"),
            let endText = call.getString("endAt"),
            let startAt = DepartureNativeCoordinator.shared.parseDate(startText),
            let endAt = DepartureNativeCoordinator.shared.parseDate(endText)
        else {
            call.reject("A valid calendar date range is required.")
            return
        }
        call.resolve([
            "events": DepartureNativeCoordinator.shared.calendarEvents(startAt: startAt, endAt: endAt)
        ])
    }

    @objc func verifyAlarm(_ call: CAPPluginCall) {
        guard
            let fireAtText = call.getString("fireAt"),
            let fireAt = DepartureNativeCoordinator.shared.parseDate(fireAtText)
        else {
            call.reject("A valid fireAt date is required.")
            return
        }
        Task { call.resolve(await DepartureNativeCoordinator.shared.verifyAlarm(fireAt: fireAt)) }
    }

    @objc func openSystemSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.reject("System settings are unavailable.")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url) { _ in call.resolve() }
        }
    }
}

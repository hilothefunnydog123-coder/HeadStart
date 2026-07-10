import SwiftUI
import WidgetKit

struct DeparturePlanEntry: TimelineEntry {
    let date: Date
    let plan: DepartureSurfacePlan?
}

struct DeparturePlanProvider: TimelineProvider {
    func placeholder(in context: Context) -> DeparturePlanEntry {
        DeparturePlanEntry(date: Date(), plan: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (DeparturePlanEntry) -> Void) {
        completion(DeparturePlanEntry(date: Date(), plan: DepartureSharedStore.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<DeparturePlanEntry>) -> Void) {
        let now = Date()
        let plan = DepartureSharedStore.load()
        let next = plan.map { plan in
            let minutesUntilWake = plan.wakeAt.timeIntervalSince(now) / 60
            let delayMinutes: Double = minutesUntilWake > 180 ? 15 : (minutesUntilWake > 30 ? 5 : 1)
            return now.addingTimeInterval(delayMinutes * 60)
        } ?? now.addingTimeInterval(15 * 60)
        completion(Timeline(entries: [DeparturePlanEntry(date: now, plan: plan)], policy: .after(next)))
    }
}

struct DeparturePlanWidget: Widget {
    let kind = "DeparturePlanWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: DeparturePlanProvider()) { entry in
            DeparturePlanWidgetView(entry: entry)
                .departureWidgetBackground()
        }
        .configurationDisplayName("Next departure")
        .description("See when to wake and leave without opening Departure.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

private extension View {
    @ViewBuilder
    func departureWidgetBackground() -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            containerBackground(.fill.tertiary, for: .widget)
        } else {
            background(Color(.secondarySystemBackground))
        }
    }
}

private struct DeparturePlanWidgetView: View {
    let entry: DeparturePlanEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if let plan = entry.plan {
            switch family {
            case .accessoryInline:
                Label("Leave \(plan.leaveAt, style: .time)", systemImage: "figure.walk.departure")
            case .accessoryRectangular:
                VStack(alignment: .leading, spacing: 2) {
                    Label("Leave", systemImage: "figure.walk.departure")
                        .font(.caption.bold())
                    Text(plan.leaveAt, style: .time)
                        .font(.title3.bold())
                    Text(plan.destinationLabel)
                        .font(.caption2)
                        .lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            default:
                VStack(alignment: .leading, spacing: 8) {
                    Label("Departure", systemImage: "alarm.fill")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                    Text(plan.leaveAt, style: .time)
                        .font(.system(size: 32, weight: .bold, design: .rounded))
                    Text("Leave for \(plan.destinationLabel)")
                        .font(.caption)
                        .lineLimit(2)
                    Spacer(minLength: 0)
                    Text("Wake \(plan.wakeAt, style: .time)")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 8) {
                Image(systemName: "alarm")
                    .font(.title2)
                Text("No departure planned")
                    .font(.headline)
                Text("Add your next commitment in Departure.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

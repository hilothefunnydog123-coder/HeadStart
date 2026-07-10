import ActivityKit
import SwiftUI
import WidgetKit

struct DepartureLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DepartureActivityAttributes.self) { context in
            HStack(spacing: 14) {
                Image(systemName: "figure.walk.departure")
                    .font(.title2)
                    .foregroundStyle(.indigo)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Next departure")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                    Text(context.state.leaveAt, style: .timer)
                        .font(.title2.bold().monospacedDigit())
                    Text(context.attributes.destinationLabel)
                        .font(.caption)
                        .lineLimit(1)
                }
                Spacer()
            }
            .padding()
            .activityBackgroundTint(Color.indigo.opacity(0.12))
            .activitySystemActionForegroundColor(.indigo)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label("Leave", systemImage: "figure.walk.departure")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(context.state.leaveAt, style: .timer)
                        .monospacedDigit()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.attributes.destinationLabel)
                        .lineLimit(1)
                }
            } compactLeading: {
                Image(systemName: "alarm.fill")
            } compactTrailing: {
                Text(context.state.leaveAt, style: .timer)
                    .monospacedDigit()
                    .frame(width: 48)
            } minimal: {
                Image(systemName: "figure.walk.departure")
            }
            .keylineTint(.indigo)
        }
    }
}

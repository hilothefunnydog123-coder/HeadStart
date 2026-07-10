import AlarmKit
import SwiftUI
import WidgetKit

@available(iOS 26.0, *)
struct DepartureAlarmLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: AlarmAttributes<DepartureAlarmMetadata>.self) { context in
            HStack(spacing: 14) {
                Image(systemName: "alarm.waves.left.and.right.fill")
                    .font(.title)
                    .foregroundStyle(.indigo)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Time to wake up")
                        .font(.headline)
                    if let metadata = context.attributes.metadata {
                        Text("Leave for \(metadata.destinationLabel) at \(metadata.leaveAt, style: .time)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }
            .padding()
            .activityBackgroundTint(Color.indigo.opacity(0.14))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "alarm.fill")
                }
                DynamicIslandExpandedRegion(.center) {
                    Text("Time to wake up").bold()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    if let metadata = context.attributes.metadata {
                        Text("Leave at \(metadata.leaveAt, style: .time) · \(metadata.destinationLabel)")
                            .lineLimit(1)
                    }
                }
            } compactLeading: {
                Image(systemName: "alarm.fill")
            } compactTrailing: {
                Text("Wake")
            } minimal: {
                Image(systemName: "alarm.fill")
            }
            .keylineTint(.indigo)
        }
    }
}

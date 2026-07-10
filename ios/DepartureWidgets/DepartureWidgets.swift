import SwiftUI
import WidgetKit

@main
struct DepartureWidgets: WidgetBundle {
    @WidgetBundleBuilder
    var body: some Widget {
        DeparturePlanWidget()
        DepartureLiveActivity()
        if #available(iOS 26.0, *) {
            DepartureAlarmLiveActivity()
        }
    }
}

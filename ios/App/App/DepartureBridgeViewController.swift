import Capacitor

final class DepartureBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginType(DepartureNativePlugin.self)
    }
}

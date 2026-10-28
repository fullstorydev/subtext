import FBControlCore
import FBSimulatorAX
import FBSimulatorControl
import Foundation

/// One long-lived connection per simulator: the FBSimulatorControl handle, its UI-automation reader
/// and its HID channel are built on first use and reused until a call through them fails.
final class SimulatorConnection {
  let simulator: Simulator
  let automation: any UIAutomation
  private var hid: SimulatorHID?

  init(simulator: Simulator) throws {
    self.simulator = simulator
    automation = try simulator.uiAutomation(backend: .accessibility)
  }

  func hidChannel() async throws -> SimulatorHID {
    if let hid {
      return hid
    }
    let connected = try await simulator.hid.connect()
    hid = connected
    return connected
  }

  func send(_ event: SimulatorHIDEvent, logger: any ControlCoreLogger) async throws {
    try await hidChannel().send(event: event, logger: logger)
  }
}

final class SimulatorRegistry {
  let logger: any ControlCoreLogger
  private var bootstrap: SimulatorControlBootstrap?
  private var connections: [String: SimulatorConnection] = [:]

  init(logger: any ControlCoreLogger) {
    self.logger = logger
  }

  func connection(udid: String) throws -> SimulatorConnection {
    if let cached = connections[udid] {
      try requireBooted(cached.simulator)
      return cached
    }
    guard let simulator = try simulatorSet().simulator(withUDID: udid) else {
      throw HelperError(code: "device_not_found", message: "no simulator with UDID \(udid) in the default device set")
    }
    try requireBooted(simulator)
    let connection = try SimulatorConnection(simulator: simulator)
    connections[udid] = connection
    log("connected to \(simulator.name) (\(udid))")
    return connection
  }

  func invalidate(udid: String) {
    if connections.removeValue(forKey: udid) != nil {
      log("dropped cached connection for \(udid)")
    }
  }

  /// Runs `body` against the cached connection. A failure drops the connection so the next call
  /// rebuilds it, which is what a simulator reboot under the long-lived helper needs. Only idempotent
  /// work (reads) is retried immediately; an input event may have partially landed.
  func withConnection<T>(udid: String, retry: Bool, _ body: (SimulatorConnection) async throws -> T) async throws -> T {
    let first = try connection(udid: udid)
    do {
      return try await body(first)
    } catch let error as HelperError {
      throw error
    } catch {
      invalidate(udid: udid)
      guard retry else { throw error }
      log("\(udid): \(error.localizedDescription); reconnecting and retrying once")
      return try await body(try connection(udid: udid))
    }
  }

  private func simulatorSet() throws -> SimulatorSet {
    if let bootstrap {
      return bootstrap.set
    }
    let configuration = SimulatorControlConfiguration(deviceSetPath: nil, logger: logger)
    let created = try SimulatorControlBootstrap(configuration: configuration)
    bootstrap = created
    return created.set
  }

  private func requireBooted(_ simulator: Simulator) throws {
    guard simulator.state == .booted else {
      throw HelperError(
        code: "not_booted",
        message: "simulator \(simulator.name) (\(simulator.udid)) is \(simulator.stateString.rawValue), not booted; run `xcrun simctl boot \(simulator.udid)`")
    }
  }
}

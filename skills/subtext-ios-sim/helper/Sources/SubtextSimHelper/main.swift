import FBControlCore
import FBSimulatorAX
import FBSimulatorControl
import Foundation

let writer = ResponseWriter()
let logger = ControlCoreGlobalConfiguration.systemLogger(
  writingToStderr: true, debugLogging: ProcessInfo.processInfo.environment["SUBTEXT_SIM_HELPER_DEBUG"] != nil)
ControlCoreGlobalConfiguration.defaultLogger = logger
let registry = SimulatorRegistry(logger: logger)

let buttons: [String: SimulatorHIDButton] = [
  "home": .homeButton,
  "lock": .lock,
  "siri": .siri,
  "side": .sideButton,
  "apple_pay": .applePay,
  "volume_up": .volumeUp,
  "volume_down": .volumeDown,
]

func handle(_ request: Request) async throws -> [String: Any] {
  switch request.cmd {
  case "hello":
    return ["version": helperVersion, "xcode": xcodeVersion() as Any? ?? NSNull(), "fbsimctl": fbSimulatorControlVersion]

  case "describe":
    let udid = try request.string("udid")
    return try await registry.withConnection(udid: udid, retry: true) { try await Describe.run($0, udid: udid) }

  case "tap":
    let udid = try request.string("udid")
    let event = SimulatorHIDEvent.tapAt(x: try request.number("x"), y: try request.number("y"))
    try await send(event, udid: udid)

  case "type":
    let udid = try request.string("udid")
    guard let text = request.args["text"] as? String else {
      throw HelperError.badRequest("missing string arg 'text'")
    }
    try await send(.composite(try Keyboard.events(typing: text)), udid: udid)

  case "swipe":
    let udid = try request.string("udid")
    let event = SimulatorHIDEvent.swipe(
      try request.number("x1"), yStart: try request.number("y1"),
      xEnd: try request.number("x2"), yEnd: try request.number("y2"),
      delta: SimulatorHIDEvent.defaultSwipeDelta,
      duration: request.optionalNumber("duration") ?? 0.3)
    try await send(event, udid: udid)

  case "button":
    let udid = try request.string("udid")
    let name = try request.string("name")
    guard let button = buttons[name.lowercased()] else {
      throw HelperError.badRequest("unknown button '\(name)'; use one of \(buttons.keys.sorted().joined(separator: ", "))")
    }
    try await send(.shortButtonPress(button), udid: udid)

  case "key":
    let udid = try request.string("udid")
    try await send(.shortKeyPress(try Keyboard.keyCode(named: try request.string("key"))), udid: udid)

  default:
    throw HelperError(code: "unknown_cmd", message: "unknown cmd '\(request.cmd)'")
  }
  return [:]
}

func send(_ event: SimulatorHIDEvent, udid: String) async throws {
  try await registry.withConnection(udid: udid, retry: false) { try await $0.send(event, logger: logger) }
}

func xcodeVersion() -> String? {
  let developerDir =
    ProcessInfo.processInfo.environment["DEVELOPER_DIR"]
    ?? (try? FileManager.default.destinationOfSymbolicLink(atPath: "/var/db/xcode_select_link"))
    ?? "/Applications/Xcode.app/Contents/Developer"
  let plist = URL(fileURLWithPath: developerDir).deletingLastPathComponent().appendingPathComponent("Info.plist")
  guard let info = NSDictionary(contentsOf: plist) else { return nil }
  return info["CFBundleShortVersionString"] as? String
}

func classify(_ error: Error) -> HelperError {
  if let error = error as? HelperError {
    return error
  }
  let message = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
  switch error {
  case AccessibilityError.simulatorNotBooted:
    return HelperError(code: "not_booted", message: message)
  case AccessibilityError.accessibilityUnavailable, AccessibilityError.springBoardNotRunning,
    AccessibilityError.springBoardRestarting, AccessibilityError.serviceNotAnswering:
    return HelperError(code: "ax_unavailable", message: message)
  case is AccessibilityError, is UIAutomationError:
    return HelperError(code: "ax_error", message: message)
  case is SimulatorHIDError:
    return HelperError(code: "hid_error", message: message)
  default:
    return HelperError(code: "internal", message: message)
  }
}

let lines = AsyncStream<String> { continuation in
  Thread.detachNewThread {
    while let line = readLine(strippingNewline: true) {
      continuation.yield(line)
    }
    continuation.finish()
  }
}

Task {
  log("ready (v\(helperVersion), \(fbSimulatorControlVersion))")
  for await line in lines where !line.trimmingCharacters(in: .whitespaces).isEmpty {
    let started = Date()
    var id: Any = NSNull()
    var command = "?"
    do {
      let request = try Request(line: line)
      id = request.id
      command = request.cmd
      writer.success(id: id, result: try await handle(request))
    } catch {
      let failure = classify(error)
      log("\(command) failed [\(failure.code)]: \(failure.message)")
      writer.failure(id: id, error: failure)
    }
    log(String(format: "%@ %.0fms", command, Date().timeIntervalSince(started) * 1000))
  }
  exit(0)
}

dispatchMain()

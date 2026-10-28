import FBSimulatorAX
import FBSimulatorControl
import Foundation

enum Describe {
  static let keys: Set<AXKeys> = [.type, .role, .subrole, .traits, .label, .uniqueID, .value, .frameDict, .enabled]

  static let accessibilityDisabledMessage =
    "the app exposes no accessibility elements; enable app accessibility with "
    + "`xcrun simctl spawn %@ defaults write com.apple.Accessibility ApplicationAccessibilityEnabled -bool true` "
    + "and relaunch the app"

  static func run(_ connection: SimulatorConnection, udid: String) async throws -> [String: Any] {
    let options = AccessibilityRequestOptions(format: .nested, keys: keys)
    let response = try await connection.automation.describe(.frontmost, options: options)
    let elements = response.elements.elements
    let root: [String: Any]
    if elements.count == 1 {
      root = node(elements[0])
    } else {
      root = syntheticRoot(children: elements.map(node))
    }
    if (root["children"] as? [Any])?.isEmpty ?? true {
      throw HelperError(code: "ax_disabled", message: String(format: accessibilityDisabledMessage, udid))
    }
    return ["screen": screen(connection.simulator, root: root), "root": root]
  }

  private static func node(_ element: AccessibilityDocumentElement) -> [String: Any] {
    [
      "role": json(element.role),
      "subrole": json(element.subrole),
      "type": json(element.type),
      "label": json(element.label),
      "identifier": json(element.identifier),
      "value": json(element.value.flatMap { $0 }.flatMap(string)),
      "frame": frame(element.frame.flatMap { $0 }?.rect),
      "enabled": element.enabled.flatMap { $0 } ?? true,
      "traits": element.traits.flatMap { $0 } ?? [],
      "children": (element.children ?? []).map(node),
    ]
  }

  private static func syntheticRoot(children: [[String: Any]]) -> [String: Any] {
    [
      "role": "AXGroup", "subrole": NSNull(), "type": "Group", "traits": [String](), "label": NSNull(), "identifier": NSNull(), "value": NSNull(),
      "frame": frame(nil), "enabled": true, "children": children,
    ]
  }

  private static func screen(_ simulator: Simulator, root: [String: Any]) -> [String: Any] {
    if let info = simulator.screenInfo, info.scale > 0 {
      return [
        "w": Double(info.widthPixels) / Double(info.scale),
        "h": Double(info.heightPixels) / Double(info.scale),
      ]
    }
    let rootFrame = root["frame"] as? [String: Any]
    return ["w": rootFrame?["w"] ?? 0, "h": rootFrame?["h"] ?? 0]
  }

  private static func frame(_ rect: CGRect?) -> [String: Any] {
    let rect = rect ?? .zero
    return ["x": rect.origin.x, "y": rect.origin.y, "w": rect.size.width, "h": rect.size.height]
  }

  private static func json(_ value: String??) -> Any {
    value.flatMap { $0 }.map { $0 as Any } ?? NSNull()
  }

  private static func json(_ value: String?) -> Any {
    value.map { $0 as Any } ?? NSNull()
  }

  private static func string(_ value: AccessibilityAttributeValue) -> String? {
    switch value {
    case .string(let string): return string
    case .bool(let bool): return bool ? "1" : "0"
    case .int(let int): return String(int)
    case .double(let double): return String(double)
    case .null: return nil
    case .array, .object:
      guard let data = try? JSONEncoder().encode(value) else { return nil }
      return String(decoding: data, as: UTF8.self)
    @unknown default:
      return nil
    }
  }
}

import FBSimulatorControl
import Foundation

/// USB HID usage IDs (keyboard page 0x07) for a US keyboard layout.
enum Keyboard {
  static let leftShift: UInt32 = 225

  /// Controlled React Native TextInputs echo every keystroke through JS and drop
  /// keys that arrive while an echo is in flight; this pause lets each one land.
  static let interKeyDelay: TimeInterval = 0.05

  static let namedKeys: [String: UInt32] = [
    "return": 40, "enter": 40,
    "escape": 41, "esc": 41,
    "delete": 42, "backspace": 42,
    "tab": 43,
    "space": 44,
    "forward_delete": 76, "forwarddelete": 76,
    "right": 79, "left": 80, "down": 81, "up": 82,
    "home": 74, "end": 77, "page_up": 75, "pageup": 75, "page_down": 78, "pagedown": 78,
  ]

  private static let unshifted: [Character: UInt32] = {
    var map: [Character: UInt32] = [:]
    for (offset, scalar) in "abcdefghijklmnopqrstuvwxyz".enumerated() { map[scalar] = 4 + UInt32(offset) }
    for (offset, scalar) in "1234567890".enumerated() { map[scalar] = 30 + UInt32(offset) }
    let punctuation: [Character: UInt32] = [
      "\n": 40, "\t": 43, " ": 44, "-": 45, "=": 46, "[": 47, "]": 48, "\\": 49,
      ";": 51, "'": 52, "`": 53, ",": 54, ".": 55, "/": 56,
    ]
    map.merge(punctuation) { $1 }
    return map
  }()

  private static let shifted: [Character: UInt32] = {
    var map: [Character: UInt32] = [:]
    for (offset, scalar) in "ABCDEFGHIJKLMNOPQRSTUVWXYZ".enumerated() { map[scalar] = 4 + UInt32(offset) }
    for (offset, scalar) in "!@#$%^&*()".enumerated() { map[scalar] = 30 + UInt32(offset) }
    let punctuation: [Character: UInt32] = [
      "_": 45, "+": 46, "{": 47, "}": 48, "|": 49, ":": 51, "\"": 52, "~": 53, "<": 54, ">": 55, "?": 56,
    ]
    map.merge(punctuation) { $1 }
    return map
  }()

  static func events(typing text: String) throws -> [SimulatorHIDEvent] {
    var events: [SimulatorHIDEvent] = []
    for character in text {
      if !events.isEmpty {
        events.append(.delay(interKeyDelay))
      }
      if let code = unshifted[character] {
        events.append(.keyboard(direction: .down, keyCode: code))
        events.append(.keyboard(direction: .up, keyCode: code))
      } else if let code = shifted[character] {
        events.append(.keyboard(direction: .down, keyCode: leftShift))
        events.append(.keyboard(direction: .down, keyCode: code))
        events.append(.keyboard(direction: .up, keyCode: code))
        events.append(.keyboard(direction: .up, keyCode: leftShift))
      } else {
        throw HelperError(
          code: "unsupported_text",
          message: "character \(String(reflecting: String(character))) has no US-keyboard key; only printable ASCII, newline and tab can be typed")
      }
    }
    return events
  }

  static func keyCode(named name: String) throws -> UInt32 {
    let normalized = name.lowercased()
    if let code = namedKeys[normalized] {
      return code
    }
    if normalized.count == 1, let code = unshifted[Character(normalized)] {
      return code
    }
    if let numeric = UInt32(normalized) {
      return numeric
    }
    throw HelperError.badRequest(
      "unknown key '\(name)'; use one of \(namedKeys.keys.sorted().joined(separator: ", ")), a single character, or a numeric HID usage")
  }
}

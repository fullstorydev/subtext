import Foundation

let helperVersion = "0.1.0"
let fbSimulatorControlVersion = "idb v1.7.7"

struct HelperError: Error {
  let code: String
  let message: String

  static func badRequest(_ message: String) -> HelperError { HelperError(code: "bad_request", message: message) }
}

struct Request {
  let id: Any
  let cmd: String
  let args: [String: Any]

  init(line: String) throws {
    guard let data = line.data(using: .utf8),
      let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
    else {
      throw HelperError.badRequest("request is not a JSON object")
    }
    id = object["id"] ?? NSNull()
    guard let cmd = object["cmd"] as? String else {
      throw HelperError.badRequest("missing string field 'cmd'")
    }
    self.cmd = cmd
    args = object["args"] as? [String: Any] ?? [:]
  }

  func string(_ key: String) throws -> String {
    guard let value = args[key] as? String, !value.isEmpty else {
      throw HelperError.badRequest("missing string arg '\(key)'")
    }
    return value
  }

  func number(_ key: String) throws -> Double {
    guard let value = optionalNumber(key) else {
      throw HelperError.badRequest("missing numeric arg '\(key)'")
    }
    return value
  }

  func optionalNumber(_ key: String) -> Double? {
    (args[key] as? NSNumber)?.doubleValue
  }
}

/// Protocol output goes to a private duplicate of the original stdout; fd 1 itself is pointed at stderr
/// so that nothing the linked frameworks print can corrupt the JSON-lines stream.
final class ResponseWriter {
  private let handle: FileHandle

  init() {
    let protocolFD = dup(STDOUT_FILENO)
    dup2(STDERR_FILENO, STDOUT_FILENO)
    handle = FileHandle(fileDescriptor: protocolFD, closeOnDealloc: true)
  }

  func success(id: Any, result: [String: Any]) {
    write(["id": id, "ok": true, "result": result])
  }

  func failure(id: Any, error: HelperError) {
    write(["id": id, "ok": false, "error": ["code": error.code, "message": error.message]])
  }

  private func write(_ object: [String: Any]) {
    do {
      var data = try JSONSerialization.data(withJSONObject: object, options: [.withoutEscapingSlashes])
      data.append(0x0A)
      handle.write(data)
    } catch {
      log("failed to encode response: \(error)")
    }
  }
}

func log(_ message: String) {
  FileHandle.standardError.write(Data("[subtext-sim-helper] \(message)\n".utf8))
}

import Foundation
#if SUBTEXT_FULLSTORY
import FullStory
#endif

/// Logs the session URL as `FULLSTORY_SESSION_URL <url>` so `subtext-sim session-url` can find it.
enum FullstoryBridge {
    #if SUBTEXT_FULLSTORY
    private final class Delegate: NSObject, FSDelegate {
        func fullstoryDidStartSession(_ sessionUrl: String) {
            appLog.info("FULLSTORY_SESSION_URL \(sessionUrl, privacy: .public)")
            print("FULLSTORY_SESSION_URL \(sessionUrl)")
        }
    }

    private static let delegate = Delegate()

    static func start() {
        FS.delegate = delegate
    }
    #else
    static func start() {
        appLog.info("built without the Fullstory SDK")
    }
    #endif
}

// swift-tools-version:6.0
import PackageDescription

// FBSimulatorControl and friends come from idb's released, prebuilt xcframeworks.
// URLs and checksums are copied verbatim from the Package.swift attached to the idb v1.7.7 release.
let idbRelease = "https://github.com/facebook/idb/releases/download/v1.7.7"

let idbFrameworks: [(name: String, checksum: String)] = [
  ("FBControlCore", "887a26ab93c9f54cddd6c32f21b8cc5586f1396644759706036c02653af47903"),
  ("FBControlCoreObjC", "8f2f37fd6a74b98f516aabf4c27881a81e44831a0fa7f01895cced10de2469d9"),
  ("FBSimulatorAX", "1331b557dc775847a4e46522b1bfb0b393181a28646621a3271169c06f2829eb"),
  ("FBSimulatorBridgeProtocol", "150761f6905edc5aa56783931f0006f9d43c844b94d0a424db2cd5b83de22fe7"),
  ("FBSimulatorControl", "b2c88f22ca55b3da252d8a7e33a98be911347a2d78bd429038c38ecbf48f3077"),
  ("FBSimulatorServices", "e97f47bd119f639c4bd3c86fe38ac1989c0bd47f00e035d9a5f07d8996117608"),
  ("IDBPrivateHeaders", "eb78edff346bc38b7392a5243235c6d42827b7036371dc8a5e166fa6ee3b9461"),
  ("SimulatorIPC", "4419875068465239711bcf296578a7259f6fa9db00c5dfadb5e31a57a99b2ab7"),
]

let package = Package(
  name: "SubtextSimHelper",
  platforms: [.macOS(.v15)],
  products: [
    .executable(name: "subtext-sim-helper", targets: ["SubtextSimHelper"])
  ],
  targets: idbFrameworks.map {
    .binaryTarget(name: $0.name, url: "\(idbRelease)/\($0.name).xcframework.zip", checksum: $0.checksum)
  } + [
    .executableTarget(
      name: "SubtextSimHelper",
      dependencies: idbFrameworks.map { .target(name: $0.name) },
      swiftSettings: [.swiftLanguageMode(.v5)],
      linkerSettings: [
        // idb's CoreSimulatorStub / AccessibilityPlatformTranslationStub frameworks only re-export these,
        // and would have to ship beside the binary. Weak-linking the real private frameworks at their
        // install paths keeps the helper a single self-contained file.
        .unsafeFlags([
          "-Xlinker", "-F/Library/Developer/PrivateFrameworks",
          "-Xlinker", "-weak_framework", "-Xlinker", "CoreSimulator",
          "-Xlinker", "-F/System/Library/PrivateFrameworks",
          "-Xlinker", "-weak_framework", "-Xlinker", "AccessibilityPlatformTranslation",
        ])
      ]
    )
  ]
)

import SwiftUI
import os

let appLog = Logger(subsystem: "dev.subtext.SimSample", category: "app")

final class Session: ObservableObject {
    @Published var signedInEmail: String?
}

@main
struct SampleApp: App {
    @StateObject private var session = Session()

    init() {
        FullstoryBridge.start()
        appLog.info("launched")
        print("Subtext Sim Sample launched")
    }

    var body: some Scene {
        WindowGroup {
            if let email = session.signedInEmail {
                MainTabs(email: email)
                    .environmentObject(session)
            } else {
                LoginView()
                    .environmentObject(session)
            }
        }
    }
}

struct LoginView: View {
    @EnvironmentObject private var session: Session
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?

    var body: some View {
        VStack(spacing: 16) {
            Text("Subtext Sim Sample")
                .font(.largeTitle.bold())
                .accessibilityIdentifier("login-title")
            TextField("Email", text: $email)
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("login-email")
            SecureField("Password", text: $password)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("login-password")
            if let error {
                Text(error)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("login-error")
            }
            Button("Sign In", action: signIn)
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("login-submit")
        }
        .padding(24)
    }

    private func signIn() {
        guard email.contains("@"), !password.isEmpty else {
            error = "Enter an email and password"
            appLog.error("sign-in rejected: missing email or password")
            print("sign-in rejected")
            return
        }
        appLog.info("signed in as \(email, privacy: .public)")
        print("signed in as \(email)")
        session.signedInEmail = email
    }
}

struct MainTabs: View {
    let email: String

    var body: some View {
        TabView {
            ProductList()
                .tabItem {
                    Label("Products", systemImage: "bag")
                        .accessibilityIdentifier("tab-products")
                }
            NetworkView()
                .tabItem {
                    Label("Network", systemImage: "network")
                        .accessibilityIdentifier("tab-network")
                }
            AccountView(email: email)
                .tabItem {
                    Label("Account", systemImage: "person.crop.circle")
                        .accessibilityIdentifier("tab-account")
                }
        }
    }
}

struct Product: Identifiable, Hashable {
    let id: Int
    var name: String { "Product \(id)" }
    var price: String { String(format: "$%d.%02d", 5 + id % 95, (id * 37) % 100) }

    static let all = (1...200).map(Product.init)
}

struct ProductList: View {
    var body: some View {
        NavigationStack {
            List(Product.all) { product in
                NavigationLink(value: product) {
                    HStack {
                        Text(product.name)
                        Spacer()
                        Text(product.price).foregroundStyle(.secondary)
                    }
                }
                .accessibilityIdentifier("product-row-\(product.id)")
            }
            .navigationTitle("Products")
            .navigationDestination(for: Product.self) { ProductDetail(product: $0) }
        }
    }
}

struct ProductDetail: View {
    let product: Product
    @State private var inCart = false

    var body: some View {
        VStack(spacing: 16) {
            Text(product.name)
                .font(.title.bold())
                .accessibilityIdentifier("product-detail-name")
            Text(product.price)
                .font(.title2)
                .accessibilityIdentifier("product-detail-price")
            Button(inCart ? "Added" : "Add to Cart") {
                inCart = true
                appLog.info("added \(product.name, privacy: .public) to cart")
                print("added \(product.name) to cart")
            }
            .buttonStyle(.borderedProminent)
            .disabled(inCart)
            .accessibilityIdentifier("product-detail-add")
        }
        .padding()
        .navigationTitle(product.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct NetworkView: View {
    @State private var status = "Idle"
    @State private var requestCount = 0

    var body: some View {
        VStack(spacing: 16) {
            Button("Send Request", action: send)
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("network-send")
            Text(status)
                .accessibilityIdentifier("network-status")
        }
        .padding()
    }

    private func send() {
        requestCount += 1
        let path = "subtext-sim/order-\(requestCount)"
        var request = URLRequest(url: URL(string: "https://httpbin.org/anything/\(path)")!)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["order": requestCount, "items": ["Product 1", "Product 2"]])
        status = "Sending…"
        appLog.info("POST \(path, privacy: .public)")
        print("POST /anything/\(path)")
        URLSession.shared.dataTask(with: request) { _, response, error in
            let code = (response as? HTTPURLResponse)?.statusCode ?? -1
            let result = error.map { "failed: \($0.localizedDescription)" } ?? "HTTP \(code)"
            appLog.info("POST \(path, privacy: .public) -> \(result, privacy: .public)")
            print("POST /anything/\(path) -> \(result)")
            DispatchQueue.main.async { status = result }
        }.resume()
    }
}

struct AccountView: View {
    @EnvironmentObject private var session: Session
    let email: String

    var body: some View {
        VStack(spacing: 16) {
            Text(email)
                .accessibilityIdentifier("account-email")
            Button("Sign Out") {
                appLog.info("signed out")
                print("signed out")
                session.signedInEmail = nil
            }
            .accessibilityIdentifier("account-sign-out")
        }
        .padding()
    }
}

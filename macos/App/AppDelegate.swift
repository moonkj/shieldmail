import Cocoa
import SwiftUI

@main
struct ShieldMailApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 480, minHeight: 540)
        }
        .windowResizability(.contentSize)
    }
}

// On-device pointer state for the active/previous release (ADR 0004).
import Foundation

struct SalvePushState: Codable {
  var currentReleaseId: String?
  var previousReleaseId: String?
  var bootStatus: String
}

// Exposed with C linkage (not the generated Swift-ObjC bridging header, which nitrogen configures for
// C++ interop and is unsuitable for a plain Objective-C++ caller) so SalvePushCrashHandlerBridge.mm can
// call it directly.
import Foundation

@_cdecl("salve_push_rollback_if_unconfirmed")
func salve_push_rollback_if_unconfirmed() {
  SalvePushStorage.rollbackToPreviousIfUnconfirmed()
}

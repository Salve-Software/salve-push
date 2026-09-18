// Objective-C++ shim so Swift can install the shared POSIX signal handler
// (plain C API, see ../cpp/salve_push_crash_handler.h) and RCTLog's fatal
// JS error hook, neither of which is directly reachable from Swift.
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface SalvePushCrashHandlerBridge : NSObject

/// Installs the native POSIX signal handler (writes crash.marker on
/// SIGABRT/SIGSEGV/...) and RCTLogFunction hook (writes crash.marker on a
/// fatal JS error surfaced through React Native's logging pipeline).
+ (void)installWithBaseDirectory:(NSString *)baseDirectory;

@end

NS_ASSUME_NONNULL_END

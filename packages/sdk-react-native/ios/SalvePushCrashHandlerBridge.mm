#import "SalvePushCrashHandlerBridge.h"

#import <React/RCTLog.h>

#include "../cpp/salve_push_crash_handler.h"

// Implemented in SalvePushRollback.swift via @_cdecl - not the generated Swift-ObjC bridging header,
// which nitrogen configures for C++ interop (SWIFT_OBJC_INTEROP_MODE=objcxx) and is unsuitable here.
extern "C" void salve_push_rollback_if_unconfirmed(void);

static void SalvePushHandleUncaughtException(NSException *exception) {
  salve_push_rollback_if_unconfirmed();
}

@implementation SalvePushCrashHandlerBridge

+ (void)installWithBaseDirectory:(NSString *)baseDirectory {
  salve_push_install_crash_handlers(baseDirectory.UTF8String);
  [self installUncaughtExceptionHandler];
  [self installFatalJSErrorHandler];
}

+ (void)installUncaughtExceptionHandler {
  NSSetUncaughtExceptionHandler(&SalvePushHandleUncaughtException);
}

+ (void)installFatalJSErrorHandler {
  RCTLogFunction previous = RCTGetLogFunction();
  RCTSetLogFunction(^(RCTLogLevel level, RCTLogSource source, NSString *fileName, NSNumber *lineNumber,
                       NSString *message) {
    if (level >= RCTLogLevelFatal) {
      salve_push_rollback_if_unconfirmed();
    }
    if (previous) {
      previous(level, source, fileName, lineNumber, message);
    }
  });
}

@end

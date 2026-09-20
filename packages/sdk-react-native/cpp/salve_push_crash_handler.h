// Plain C API so both Swift (via an Objective-C++ shim) and Kotlin (via JNI) can call the same signal-handling code (ADR 0004).
#ifndef SALVE_PUSH_CRASH_HANDLER_H
#define SALVE_PUSH_CRASH_HANDLER_H

#ifdef __cplusplus
extern "C" {
#endif

/**
 * Installs POSIX signal handlers (SIGABRT, SIGSEGV, SIGILL, SIGBUS, SIGFPE,
 * SIGTRAP, SIGPIPE, SIGSYS) that write a crash marker file under
 * `base_directory` before chaining to any previously installed handler
 * (e.g. a crash reporter) and re-raising the signal.
 *
 * Must be called once, as early as possible in the app's native lifecycle.
 */
void salve_push_install_crash_handlers(const char* base_directory);

#ifdef __cplusplus
}
#endif

#endif  // SALVE_PUSH_CRASH_HANDLER_H

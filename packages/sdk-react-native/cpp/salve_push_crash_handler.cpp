#include "salve_push_crash_handler.h"

#include <fcntl.h>
#include <signal.h>
#include <unistd.h>

#include <cstdio>
#include <cstring>

// This file intentionally avoids the C++ standard library containers and
// allocation (std::string, std::vector, etc.): a signal handler may run at
// any point, including inside malloc/free, so it must stick to
// async-signal-safe primitives only (raw fixed-size buffers, POSIX
// syscalls). See signal-safety(7).
namespace {

constexpr size_t kPathBufferSize = 512;
constexpr int kMaxSignalNumber = 32;

char g_crash_marker_path[kPathBufferSize] = {0};
char g_mount_marker_path[kPathBufferSize] = {0};
struct sigaction g_previous_handlers[kMaxSignalNumber];

// Async-signal-safe check for whether the currently active release has
// confirmed a successful boot (ADR 0004 storage layout: mount.marker is
// deleted by the app once notifyAppReady() is called).
bool isMounted() {
  int fd = open(g_mount_marker_path, O_RDONLY);
  if (fd < 0) return false;
  close(fd);
  return true;
}

void writeCrashMarker(int signalNumber) {
  bool isAutoRollback = !isMounted();
  int fd = open(g_crash_marker_path, O_CREAT | O_WRONLY | O_TRUNC, 0600);
  if (fd < 0) return;
  char json[256];
  int length = snprintf(json, sizeof(json), "{\"signal\":%d,\"isAutoRollback\":%s}", signalNumber,
                         isAutoRollback ? "true" : "false");
  if (length > 0) {
    write(fd, json, static_cast<size_t>(length));
  }
  close(fd);
}

void chainToPreviousHandler(int signalNumber, siginfo_t* info, void* context) {
  if (signalNumber < 0 || signalNumber >= kMaxSignalNumber) return;
  struct sigaction* previous = &g_previous_handlers[signalNumber];
  if (previous->sa_flags & SA_SIGINFO) {
    if (previous->sa_sigaction != nullptr) {
      previous->sa_sigaction(signalNumber, info, context);
    }
  } else if (previous->sa_handler != SIG_DFL && previous->sa_handler != SIG_IGN &&
             previous->sa_handler != nullptr) {
    previous->sa_handler(signalNumber);
  }
}

void handleSignal(int signalNumber, siginfo_t* info, void* context) {
  writeCrashMarker(signalNumber);
  chainToPreviousHandler(signalNumber, info, context);

  // Restore the default disposition and re-raise so the OS produces its
  // usual crash report (and, on iOS, so any system crash reporter still
  // sees a real signal).
  signal(signalNumber, SIG_DFL);
  raise(signalNumber);
}

}  // namespace

void salve_push_install_crash_handlers(const char* base_directory) {
  snprintf(g_crash_marker_path, sizeof(g_crash_marker_path), "%s/crash.marker", base_directory);
  snprintf(g_mount_marker_path, sizeof(g_mount_marker_path), "%s/mount.marker", base_directory);

  struct sigaction action;
  memset(&action, 0, sizeof(action));
  sigemptyset(&action.sa_mask);
  action.sa_flags = SA_SIGINFO;
  action.sa_sigaction = handleSignal;

  const int signals[] = {SIGABRT, SIGSEGV, SIGILL, SIGBUS, SIGFPE, SIGTRAP, SIGPIPE, SIGSYS};
  for (int signalNumber : signals) {
    sigaction(signalNumber, nullptr, &g_previous_handlers[signalNumber]);
    sigaction(signalNumber, &action, nullptr);
  }
}

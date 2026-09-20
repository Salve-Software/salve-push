// JNI entrypoint for SalvePushCrashHandler.kt - installs the shared POSIX
// signal handlers defined in ../../../../cpp/salve_push_crash_handler.cpp.
#include <jni.h>

#include "../../../../cpp/salve_push_crash_handler.h"

extern "C" JNIEXPORT void JNICALL Java_com_margelo_nitro_salvepush_SalvePushCrashHandler_nativeInstall(
    JNIEnv* env, jobject /* thiz */, jstring baseDirectory) {
  const char* path = env->GetStringUTFChars(baseDirectory, nullptr);
  salve_push_install_crash_handlers(path);
  env->ReleaseStringUTFChars(baseDirectory, path);
}

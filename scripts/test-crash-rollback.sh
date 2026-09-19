#!/usr/bin/env bash
# Formalizes the manual crash-loop rollback verification from ADR 0004: installs release A,
# confirms it, installs release B, sends a REAL SIGABRT to the running app process before it
# confirms boot, relaunches, and asserts state.json reverted to release A on its own.
#
# Usage: scripts/test-crash-rollback.sh <ios|android>
#
# Prerequisites:
#   - iOS:     an already-booted simulator with the example app already installed (Debug build).
#   - Android: an already-booted emulator with the example app already installed (Debug build).
#   - Metro running for examples/react-native-demo (npx react-native start).
#   - Go, Docker, and Node available on PATH.
set -euo pipefail

PLATFORM="${1:?Usage: test-crash-rollback.sh <ios|android>}"
if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" ]]; then
  echo "platform must be 'ios' or 'android', got: $PLATFORM" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE_DIR="$ROOT_DIR/examples/react-native-demo"
SERVER_PORT=8090
PRIVATE_KEY="cPBH2q154PUKiHXiorGje/S7p8iAppi0lXO3uWwWZqs="
CHANNEL="staging"
RUNTIME_VERSION="1.0.0"
IOS_BUNDLE_ID="org.reactjs.native.example.ReactNativeDemo"
ANDROID_PACKAGE="com.reactnativedemo"

SERVER_PID=""
cleanup() {
  echo "==> Cleaning up"
  [[ -n "$SERVER_PID" ]] && kill "$SERVER_PID" 2>/dev/null || true
  (cd "$ROOT_DIR" && docker compose down) >/dev/null 2>&1 || true
  rm -rf /tmp/salve-push-crash-rollback-blobs
}
trap cleanup EXIT

log() { echo "==> $*"; }

# ---------------------------------------------------------------------------
# Platform-specific helpers
# ---------------------------------------------------------------------------

ios_udid() {
  xcrun simctl list devices | grep -m1 "(Booted)" | grep -oE "[0-9A-F-]{36}"
}

ios_pid() {
  xcrun simctl spawn "$(ios_udid)" launchctl list 2>/dev/null |
    awk -v id="$IOS_BUNDLE_ID" '$0 ~ id {print $1}'
}

ios_state_path() {
  local data_dir
  data_dir=$(xcrun simctl get_app_container "$(ios_udid)" "$IOS_BUNDLE_ID" data)
  echo "$data_dir/Library/Application Support/salve-push/state.json"
}

ios_launch() { xcrun simctl launch "$(ios_udid)" "$IOS_BUNDLE_ID" >/dev/null; }
ios_terminate() { xcrun simctl terminate "$(ios_udid)" "$IOS_BUNDLE_ID" >/dev/null 2>&1 || true; }
ios_crash() { kill -SIGABRT "$(ios_pid)"; }

android_pid() { adb shell pidof "$ANDROID_PACKAGE" | tr -d '\r'; }
android_launch() { adb shell am start -n "$ANDROID_PACKAGE/.MainActivity" >/dev/null; }
android_terminate() { adb shell am force-stop "$ANDROID_PACKAGE"; }
android_crash() { adb shell "run-as $ANDROID_PACKAGE kill -6 $(android_pid)"; }
android_read_state() {
  adb shell "run-as $ANDROID_PACKAGE cat /data/data/$ANDROID_PACKAGE/files/salve-push/state.json" 2>/dev/null
}

launch_app() { [[ "$PLATFORM" == "ios" ]] && ios_launch || android_launch; }
terminate_app() { [[ "$PLATFORM" == "ios" ]] && ios_terminate || android_terminate; }
crash_app() { [[ "$PLATFORM" == "ios" ]] && ios_crash || android_crash; }
read_state() {
  if [[ "$PLATFORM" == "ios" ]]; then
    cat "$(ios_state_path)" 2>/dev/null
  else
    android_read_state
  fi
}
current_release_id() {
  read_state 2>/dev/null | node -e "let s=''; process.stdin.on('data',d=>s+=d).on('end',()=>{ try { console.log(JSON.parse(s).currentReleaseId ?? '') } catch { console.log('') } })" || true
}

run_fixture() {
  local test_name="$1"
  (cd "$EXAMPLE_DIR" && npx react-native-harness \
    --config jest.crash-rollback.config.mjs \
    --testNamePattern "$test_name" \
    --harnessRunner "$PLATFORM")
}

# ---------------------------------------------------------------------------
# 1. Infra: Postgres + local salve-push-server
# ---------------------------------------------------------------------------

log "Starting Postgres"
(cd "$ROOT_DIR" && docker compose up -d postgres)
for _ in $(seq 1 30); do
  status=$(docker inspect --format='{{.State.Health.Status}}' salve-push-postgres-1 2>/dev/null || echo "")
  [[ "$status" == "healthy" ]] && break
  sleep 1
done

log "Building and starting salve-push-server on :$SERVER_PORT"
mkdir -p /tmp/salve-push-crash-rollback-blobs
(cd "$ROOT_DIR/server" && go build -o /tmp/salve-push-crash-rollback-server ./cmd/server)
ADDR=":$SERVER_PORT" \
  DATABASE_URL="postgres://salve_push:salve_push@localhost:5432/salve_push?sslmode=disable" \
  STORAGE_LOCAL_PATH="/tmp/salve-push-crash-rollback-blobs" \
  /tmp/salve-push-crash-rollback-server &
SERVER_PID=$!
for _ in $(seq 1 20); do
  curl -sf "http://localhost:$SERVER_PORT/health" >/dev/null 2>&1 && break
  sleep 0.5
done

pnpm --filter @salve-push/protocol build >/dev/null

# ---------------------------------------------------------------------------
# 2. Publish releases A and B (B initially dated older so A is picked up first)
# ---------------------------------------------------------------------------

publish_release() {
  local label="$1" version="$2" bundle_file
  bundle_file=$(mktemp)
  printf "console.log('crash-rollback-%s')" "$label" > "$bundle_file"

  local sig_json bundle_hash signature id
  sig_json=$(node "$ROOT_DIR/scripts/sign-release.mjs" "$bundle_file" "$version" "$PLATFORM" "$CHANNEL" "$RUNTIME_VERSION" "$PRIVATE_KEY")
  bundle_hash=$(node -e "console.log(JSON.parse(process.argv[1]).bundleHash)" "$sig_json")
  signature=$(node -e "console.log(JSON.parse(process.argv[1]).signature)" "$sig_json")

  id=$(curl -sf -X POST "http://localhost:$SERVER_PORT/v1/releases" \
    -F "version=$version" -F "platform=$PLATFORM" -F "channel=$CHANNEL" -F "runtime_version=$RUNTIME_VERSION" \
    -F "bundle_hash=$bundle_hash" -F "signature=$signature" \
    -F "bundle=@$bundle_file;type=application/octet-stream" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).id))")
  curl -sf -X POST "http://localhost:$SERVER_PORT/v1/releases/$id/publish" >/dev/null
  echo "$id"
}

log "Publishing release A"
RELEASE_A=$(publish_release "a" "1.0.0")
echo "  release A = $RELEASE_A"

log "Publishing release B (backdated so A resolves first)"
RELEASE_B=$(publish_release "b" "1.0.1")
docker exec salve-push-postgres-1 psql -U salve_push -d salve_push -c \
  "UPDATE releases SET created_at = '2000-01-01' WHERE id = '$RELEASE_B';" >/dev/null
echo "  release B = $RELEASE_B"

# ---------------------------------------------------------------------------
# 3. Install + confirm release A
# ---------------------------------------------------------------------------

log "Launching app and installing release A"
terminate_app
launch_app
sleep 3
run_fixture "sync to the latest published release"
run_fixture "confirm the current release booted successfully"

actual=$(current_release_id)
[[ "$actual" == "$RELEASE_A" ]] || { echo "FAIL: expected release A ($RELEASE_A) installed and confirmed, got '$actual'" >&2; exit 1; }
log "Release A confirmed (state.json currentReleaseId=$actual)"

# ---------------------------------------------------------------------------
# 4. Install release B, crash before confirming boot, relaunch, expect rollback to A
# ---------------------------------------------------------------------------

log "Making release B the latest and installing it (without confirming boot)"
docker exec salve-push-postgres-1 psql -U salve_push -d salve_push -c \
  "UPDATE releases SET created_at = now() WHERE id = '$RELEASE_B';" >/dev/null

# Run the sync in the background: the fixture holds the process alive for 8s after sync()
# completes (see __tests__/fixtures/crash-rollback.harness.ts) specifically so this script has a
# real window to deliver a crash signal while boot is still "pending" - Harness tears the app
# down as soon as the test file's run finishes, so a blocking call here would be too late.
run_fixture "sync to the latest published release" &
FIXTURE_PID=$!

app_pid=""
for _ in $(seq 1 30); do
  app_pid=$( { [[ "$PLATFORM" == "ios" ]] && ios_pid || android_pid; } || true )
  [[ -n "$app_pid" ]] && break
  sleep 1
done
[[ -n "$app_pid" ]] || { echo "FAIL: app process never appeared for the crash test" >&2; kill "$FIXTURE_PID" 2>/dev/null || true; exit 1; }

# Poll for sync()'s network round trip + native installUpdate() to actually complete (timing
# varies a lot between iOS simulator and the slower Android emulator).
actual=""
for _ in $(seq 1 20); do
  actual=$(current_release_id)
  [[ "$actual" == "$RELEASE_B" ]] && break
  sleep 1
done

[[ "$actual" == "$RELEASE_B" ]] || { echo "FAIL: expected release B ($RELEASE_B) installed before crashing, got '$actual'" >&2; kill "$FIXTURE_PID" 2>/dev/null || true; exit 1; }
log "Release B installed, boot not yet confirmed (currentReleaseId=$actual) - crashing now (pid=$app_pid)"

log "Sending a real SIGABRT to the running app process (crash before notifyAppReady)"
if [[ "$PLATFORM" == "ios" ]]; then
  kill -SIGABRT "$app_pid"
else
  adb shell "run-as $ANDROID_PACKAGE kill -6 $app_pid"
fi
wait "$FIXTURE_PID" 2>/dev/null || true # the fixture's own test run fails/errors once the app dies - expected

log "Relaunching app - this should process crash.marker and roll back to release A"
launch_app
sleep 4

actual=$(current_release_id)
if [[ "$actual" == "$RELEASE_A" ]]; then
  log "PASS: app rolled back to release A ($RELEASE_A) after the crash, as ADR 0004 requires"
else
  echo "FAIL: expected rollback to release A ($RELEASE_A), state.json shows currentReleaseId='$actual'" >&2
  exit 1
fi

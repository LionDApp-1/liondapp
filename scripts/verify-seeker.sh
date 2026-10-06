#!/usr/bin/env bash
set -euo pipefail
# Uses the isolated .qa package and synthetic MockEngine data. No wallet requests.
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
seeker_adb="${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb"
seeker_output="${1:-$repo_root/artifacts/delivery-20261006/seeker/instrumentation.txt}"
if [[ ! -x "$seeker_adb" ]]; then echo "Set ANDROID_HOME to your Android SDK." >&2; exit 1; fi
mkdir -p "$(dirname "$seeker_output")"
cd "$repo_root"
"$seeker_adb" install -r apps/mobile/app/build/outputs/apk/qa/app-qa.apk
"$seeker_adb" install -r apps/mobile/app/build/outputs/apk/androidTest/qa/app-qa-androidTest.apk
seeker_previous_awake="$("$seeker_adb" shell settings get global stay_on_while_plugged_in | tr -d '\r')"
if [[ ! "$seeker_previous_awake" =~ ^[0-9]+$ ]]; then echo "Cannot read device power settings." >&2; exit 1; fi
trap '"$seeker_adb" shell settings put global stay_on_while_plugged_in "$seeker_previous_awake" >/dev/null' EXIT
"$seeker_adb" shell svc power stayon usb
"$seeker_adb" shell input keyevent KEYCODE_WAKEUP
"$seeker_adb" shell wm dismiss-keyguard
# A secure lock still needs its owner; this does not bypass one.
"$seeker_adb" shell am instrument -w top.oneion.liondapp.qa.test/androidx.test.runner.AndroidJUnitRunner > "$seeker_output"
cat "$seeker_output"
if ! rg -q '^OK \([0-9]+ tests\)' "$seeker_output" || rg -q 'FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed' "$seeker_output"; then exit 1; fi

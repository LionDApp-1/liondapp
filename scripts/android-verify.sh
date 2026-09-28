#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
jdk_home="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
android_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"

if [[ ! -x "$jdk_home/bin/java" ]]; then
  echo "JDK 17 not found. Set JAVA_HOME to a valid JDK 17 installation." >&2
  exit 1
fi
if [[ ! -d "$android_sdk/platforms" || ! -d "$android_sdk/build-tools" ]]; then
  echo "Android SDK not found. Set ANDROID_HOME to a valid Android SDK." >&2
  exit 1
fi

cd "$repo_root"
JAVA_HOME="$jdk_home" ANDROID_HOME="$android_sdk" ANDROID_SDK_ROOT="$android_sdk" \
  ./gradlew lintDebug assembleDebug

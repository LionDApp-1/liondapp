#!/usr/bin/env bash
set -euo pipefail
umask 077

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
keystore_path="${1:-}"
jdk_home="${JAVA_HOME:-/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home}"
android_sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
key_alias="liondapp-store"
signing_mode="${2:-create}"

if [[ "$signing_mode" != "create" && "$signing_mode" != "reuse" ]]; then
  echo "Signing mode must be create or reuse." >&2
  exit 1
fi

if [[ -z "$keystore_path" ]]; then
  echo "Usage: $0 /absolute/path/liondapp-release.jks" >&2
  exit 1
fi
if [[ "$keystore_path" != /* ]]; then
  echo "Use an absolute keystore path outside the repository." >&2
  exit 1
fi
# Resolve traversal and existing symlinks before enforcing the outside-repository boundary.
keystore_path="$(python3 -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' "$keystore_path")"
case "$keystore_path" in
  "$repo_root"/*)
    echo "The release keystore must be stored outside the repository." >&2
    exit 1
    ;;
esac
if [[ "$signing_mode" == "create" && -e "$keystore_path" ]]; then
  echo "Refusing to overwrite existing keystore: $keystore_path" >&2
  echo "Retry with the same path and second argument: reuse" >&2
  exit 1
fi
if [[ "$signing_mode" == "reuse" && ! -f "$keystore_path" ]]; then
  echo "Existing keystore not found. Restore the original backup; do not create a replacement update key." >&2
  exit 1
fi
if [[ "$(uname -s)" != "Darwin" ]] || ! command -v osascript >/dev/null 2>&1; then
  echo "This script requires macOS so the password can be entered in a native hidden dialog." >&2
  exit 1
fi
if [[ ! -x "$jdk_home/bin/keytool" ]]; then
  echo "JDK 17 not found. Set JAVA_HOME to a valid JDK 17 installation." >&2
  exit 1
fi
if [[ -z "$android_sdk" || ! -d "$android_sdk/build-tools" ]]; then
  echo "Android SDK not found. Set ANDROID_HOME to a valid Android SDK." >&2
  exit 1
fi
apksigner="$(python3 "$repo_root/scripts/record-release-artifact.py" --find-tools "$android_sdk")"

if [[ ! -d "$(dirname "$keystore_path")" ]]; then
  mkdir -p "$(dirname "$keystore_path")"
  chmod 700 "$(dirname "$keystore_path")"
fi

prompt_for_password() {
  local prompt="$1"
  osascript - "$prompt" <<'APPLESCRIPT'
on run argv
  set dialogResult to display dialog (item 1 of argv) default answer "" with hidden answer buttons {"Cancel", "Continue"} default button "Continue" cancel button "Cancel" with title "LionDApp Release Signing"
  return text returned of dialogResult
end run
APPLESCRIPT
}

trap 'unset release_password release_password_confirm LIONDAPP_KEYTOOL_PASSWORD LIONDAPP_RELEASE_STORE_PASSWORD LIONDAPP_RELEASE_KEY_PASSWORD' EXIT

if [[ "$signing_mode" == "create" ]]; then
while true; do
  release_password="$(prompt_for_password "Create a dedicated LionDApp release password (12+ characters). Save it in your password manager.")"
  release_password_confirm="$(prompt_for_password "Enter the new LionDApp release password again.")"
  if [[ ${#release_password} -lt 12 ]]; then
    osascript -e 'display alert "Password is too short" message "Use at least 12 characters." as critical'
  elif [[ "$release_password" != "$release_password_confirm" ]]; then
    osascript -e 'display alert "Passwords did not match" message "Please try again." as critical'
  else
    break
  fi
done

LIONDAPP_KEYTOOL_PASSWORD="$release_password" "$jdk_home/bin/keytool" -genkeypair -v \
  -keystore "$keystore_path" \
  -storetype PKCS12 \
  -storepass:env LIONDAPP_KEYTOOL_PASSWORD \
  -keypass:env LIONDAPP_KEYTOOL_PASSWORD \
  -alias "$key_alias" \
  -keyalg RSA \
  -keysize 4096 \
  -validity 10000 \
  -dname "CN=LionDApp Store Release, O=LionDApp"
chmod 600 "$keystore_path"
else
  release_password="$(prompt_for_password "Enter the password for your existing LionDApp release key. This reuses the same key; it does not create or replace it.")"
fi

# Export only the public certificate. A wrong password/alias fails before Gradle runs.
certificate_file="$(mktemp -t liondapp-release-certificate)"
trap 'rm -f "$certificate_file"; unset release_password release_password_confirm LIONDAPP_KEYTOOL_PASSWORD LIONDAPP_RELEASE_STORE_PASSWORD LIONDAPP_RELEASE_KEY_PASSWORD' EXIT
LIONDAPP_KEYTOOL_PASSWORD="$release_password" "$jdk_home/bin/keytool" -exportcert \
  -keystore "$keystore_path" -storepass:env LIONDAPP_KEYTOOL_PASSWORD \
  -alias "$key_alias" -file "$certificate_file"
expected_signer="$(shasum -a 256 "$certificate_file" | awk '{print $1}')"

export LIONDAPP_RELEASE_STORE_FILE="$keystore_path"
export LIONDAPP_RELEASE_STORE_PASSWORD="$release_password"
export LIONDAPP_RELEASE_KEY_ALIAS="$key_alias"
export LIONDAPP_RELEASE_KEY_PASSWORD="$release_password"

cd "$repo_root"
JAVA_HOME="$jdk_home" ANDROID_HOME="$android_sdk" ANDROID_SDK_ROOT="$android_sdk" ./gradlew --no-daemon --no-configuration-cache :apps:mobile:app:lintRelease :apps:mobile:app:assembleRelease

unset release_password release_password_confirm LIONDAPP_RELEASE_STORE_PASSWORD LIONDAPP_RELEASE_KEY_PASSWORD

apk="$repo_root/apps/mobile/app/build/outputs/apk/release/app-release.apk"
JAVA_HOME="$jdk_home" python3 "$repo_root/scripts/record-release-artifact.py" "$apk" "$apksigner" "$expected_signer"
echo "Release APK: $apk"
echo "Save the password in your password manager and back up the keystore separately: $keystore_path"

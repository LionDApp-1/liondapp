#!/usr/bin/env bash
set -euo pipefail
# Local SBF/VM validation only. Never deploys, uses RPC or reads a wallet.
escrow_root="$(cd "$(dirname "$0")/.." && pwd)"
escrow_output="${1:-$escrow_root/artifacts/escrow-validation-local}"
mkdir -p "$escrow_output"
escrow_output="$(cd "$escrow_output" && pwd)"
escrow_builder="${CARGO_BUILD_SBF:-$(command -v cargo-build-sbf || true)}"
escrow_cargo="${ESCROW_CARGO:-$(command -v cargo || true)}"
if [[ -z "$escrow_builder" || -z "$escrow_cargo" ]]; then
  echo 'Set CARGO_BUILD_SBF to Agave 2.3.13 cargo-build-sbf and add Cargo to PATH.' >&2
  exit 1
fi
if ! "$escrow_builder" --version | head -1 | grep -q ' 2.3.13$'; then
  echo 'This validation recipe is pinned to cargo-build-sbf 2.3.13 / platform-tools v1.52.' >&2
  exit 1
fi
# cargo-build-sbf generates a local keypair automatically. Discard it with this
# temporary directory; a test build must not become a deployment identity.
escrow_temporary="$(mktemp -d "$escrow_output/.sbf-build.XXXXXX")"
trap 'rm -rf "$escrow_temporary"' EXIT
cd "$escrow_root"
"$escrow_builder" --manifest-path programs/testing-escrow/Cargo.toml \
  --tools-version v1.52 --sbf-out-dir "$escrow_temporary" -- --locked \
  2>&1 | tee "$escrow_output/sbf-build.txt"
python3 - "$escrow_output/sbf-build.txt" <<'PY'
import re, sys
log = open(sys.argv[1]).read()
if re.search(r'Stack offset .* exceeded|Stack frame .* exceeded|^error(?:\[|:)', log, re.M | re.I):
    raise SystemExit('Rejecting SBF compiler errors or stack-limit violations, even if the compiler exits zero.')
PY
mkdir -p "$escrow_output/sbf"
cp "$escrow_temporary/liondapp_testing_escrow.so" "$escrow_output/sbf/"
"$escrow_cargo" test --locked --manifest-path programs/testing-escrow/Cargo.toml \
  2>&1 | tee "$escrow_output/host-tests.txt"
SBF_PROGRAM_PATH="$escrow_output/sbf/liondapp_testing_escrow.so" \
  "$escrow_cargo" test --locked --manifest-path programs/testing-escrow/runtime-tests/Cargo.toml \
  2>&1 | tee "$escrow_output/runtime-tests.txt"
python3 - "$escrow_root" "$escrow_output" <<'PY'
import datetime, hashlib, json, pathlib, re, sys
root, output = map(pathlib.Path, sys.argv[1:])
def digest(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()
runtime = (output / 'runtime-tests.txt').read_text()
match = re.search(r'test result: ok\. (\d+) passed; 0 failed; 0 ignored;', runtime)
if not match or int(match[1]) < 13:
    raise SystemExit('Runtime suite did not finish all required cases.')
files = ['programs/testing-escrow/src/lib.rs', 'programs/testing-escrow/Cargo.lock',
         'programs/testing-escrow/runtime-tests/Cargo.lock',
         'programs/testing-escrow/runtime-tests/tests/lifecycle.rs', 'scripts/verify-escrow.sh']
evidence = dict(recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
    deployed=False, network='isolated LiteSVM; synthetic SPL token; no RPC',
    programId='Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkgP7n1vQgKR',
    programIdPurpose='development placeholder only',
    buildTool='cargo-build-sbf 2.3.13; platform-tools v1.52',
    runtime='LiteSVM 0.7.1', runtimeCasesPassed=int(match[1]),
    sbfSha256=digest(output / 'sbf/liondapp_testing_escrow.so'),
    sourceSha256={p: digest(root / p) for p in files})
(output / 'evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
print('Local escrow validation passed. No deployment or public payment gate was changed.')
PY

#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
temp_db="$(mktemp /tmp/liondapp-schema.XXXXXX.db)"
temp_worker="$(mktemp -d /tmp/liondapp-worker.XXXXXX)"
trap 'rm -f "$temp_db"; rm -rf "$temp_worker"' EXIT

cd "$repo_root"
node --test tests/*.test.mjs
npm run api:typecheck
npx wrangler deploy --dry-run --config apps/api/wrangler.toml --outdir "$temp_worker"
for migration in apps/api/migrations/*.sql; do
  sqlite3 "$temp_db" < "$migration"
done
xmllint --noout apps/mobile/app/src/main/AndroidManifest.xml
xmllint --noout apps/mobile/app/src/main/res/drawable/ic_liondapp.xml
xmllint --noout apps/mobile/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
xmllint --noout apps/mobile/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
xmllint --noout apps/mobile/app/src/main/res/xml/data_extraction_rules.xml
test -s apps/site/_headers
test -s apps/admin/_headers

if rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' '(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|\b(seed phrase|mnemonic)\s*[:=]|SESSION_SECRET\s*=\s*[^"<])' .; then
  echo "Potential secret material found" >&2
  exit 1
fi

echo "Local verification passed."

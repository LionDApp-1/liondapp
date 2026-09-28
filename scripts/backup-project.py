#!/usr/bin/env python3
"""Private D1 + referenced R2 snapshot. No credentials or provider output in logs."""
import argparse
from contextlib import closing
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[1]
MARKER = "liondapp-private-backup-v1"

def inspect_export(sql_path, db_path):
    with closing(sqlite3.connect(db_path)) as db:
        db.executescript(sql_path.read_text())
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise RuntimeError("backup_integrity_failed")
        if db.execute("PRAGMA foreign_key_check").fetchone():
            raise RuntimeError("backup_foreign_keys_failed")
        counts = {name: db.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
                  for name in ["users", "needs", "works", "comments", "store_catalog"]}
        keys = set()
        for (media,) in db.execute("SELECT media_json FROM needs"):
            keys.update(json.loads(media))
        for icon, screenshots in db.execute("SELECT icon_key,screenshots_json FROM works"):
            if icon:
                keys.add(icon)
            keys.update(json.loads(screenshots))
        if any(not isinstance(key, str) or not re.fullmatch(r"uploads/[a-z0-9.-]+\.skr/[a-f0-9-]+\.webp", key) for key in keys):
            raise RuntimeError("backup_invalid_media_reference")
        return counts, sorted(keys)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def prune(root, current):
    # Only this script's verified snapshots, no symlinks or unrelated backups.
    for folder in root.glob("snapshot-*"):
        if folder.is_symlink() or not folder.is_dir():
            continue
        manifest = folder / "manifest.json"
        if not manifest.is_file() or manifest.is_symlink():
            continue
        try:
            data = json.loads(manifest.read_text())
            created = datetime.fromisoformat(data["created_at"])
            if data.get("format") == MARKER and created < current - timedelta(days=7):
                shutil.rmtree(folder)
        except (ValueError, KeyError):
            continue

def backup(root, node):
    os.umask(0o077)
    root = Path(root).expanduser().resolve()
    if root == REPO or REPO in root.parents:
        raise RuntimeError("backup_must_be_outside_repository")
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    root.chmod(0o700)
    current = datetime.now(timezone.utc)
    prune(root, current)  # Enforce retention even if today's network request fails.
    stage = Path(tempfile.mkdtemp(prefix=".pending-", dir=root))
    command = [node, str(REPO / "node_modules/wrangler/bin/wrangler.js")]
    def wrangler(*args):
        try:
            # Export output can contain a signed download URL; never print it.
            result = subprocess.run(command + list(args), cwd=REPO, capture_output=True, timeout=600)
        except subprocess.TimeoutExpired:
            raise RuntimeError("backup_cloudflare_timeout") from None
        if result.returncode:
            raise RuntimeError("backup_cloudflare_request_failed_check_login_and_network")
    try:
        sql = stage / "database.sql"
        wrangler("d1", "export", "liondapp", "--remote", "--config", "apps/api/wrangler.toml", "--output", str(sql))
        restored = stage / "restore-check.sqlite"
        counts, keys = inspect_export(sql, restored)
        restored.unlink()
        media = stage / "media"
        media.mkdir(mode=0o700)
        objects = []
        for key in keys:
            name = hashlib.sha256(key.encode()).hexdigest() + ".webp"
            path = media / name
            wrangler("r2", "object", "get", "liondapp-media/" + key, "--remote", "--file", str(path), "--config", "apps/api/wrangler.toml")
            if not path.is_file() or path.stat().st_size == 0:
                raise RuntimeError("backup_media_missing")
            objects.append({"key": key, "file": "media/" + name, "sha256": digest(path), "bytes": path.stat().st_size})
        manifest = {"format": MARKER, "created_at": current.isoformat(), "database_sha256": digest(sql),
                    "database_bytes": sql.stat().st_size, "counts": counts, "media": objects,
                    "scope": "D1 and all media referenced by needs/works; unattached uploads excluded"}
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2))
        destination = root / ("snapshot-" + current.strftime("%Y%m%dT%H%M%S%fZ"))
        stage.rename(destination)
        (root / "status.json").write_text(json.dumps({"ok": True, "at": current.isoformat(), "snapshot": destination.name, "media_count": len(objects)}))
        print(json.dumps({"backup": "complete", "snapshot": str(destination), "media_count": len(objects), "integrity": "ok"}))
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        (root / "status.json").write_text(json.dumps({"ok": False, "at": current.isoformat(), "action": "Check Cloudflare login/network, then rerun backup"}))
        raise

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", required=True)
    parser.add_argument("--node", default=shutil.which("node"))
    args = parser.parse_args()
    try:
        if not args.node:
            raise RuntimeError("backup_node_not_found")
        backup(args.destination, args.node)
    except Exception as error:
        # Only our own known reason labels; don't expose SQL or provider output.
        reason = str(error) if isinstance(error, RuntimeError) and str(error).startswith("backup_") else type(error).__name__
        print(json.dumps({"backup": "failed", "reason": reason}))
        raise SystemExit(1)

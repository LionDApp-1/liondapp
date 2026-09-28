import importlib.util
from pathlib import Path
import tempfile
import json
from datetime import datetime, timedelta, timezone
import unittest

spec = importlib.util.spec_from_file_location("backup", Path(__file__).parents[1] / "scripts/backup-project.py")
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)

class BackupTest(unittest.TestCase):
    def test_export_restore_and_media_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            schema = "CREATE TABLE users(id); CREATE TABLE comments(id); CREATE TABLE store_catalog(id); CREATE TABLE needs(media_json); CREATE TABLE works(icon_key,screenshots_json);"
            key = "uploads/maker.skr/1234abcd.webp"
            sql = root / "db.sql"
            sql.write_text(schema + f"INSERT INTO needs VALUES('[\"{key}\"]'); INSERT INTO works VALUES('{key}','[]');")
            counts, keys = backup.inspect_export(sql, root / "db.sqlite")
            self.assertEqual(keys, [key])
            self.assertEqual(counts["works"], 1)
            sql.write_text(schema + "INSERT INTO needs VALUES('[\"../../secret\"]');")
            with self.assertRaisesRegex(RuntimeError, "invalid_media"):
                backup.inspect_export(sql, root / "invalid.sqlite")

    def test_retention_only_removes_own_expired_snapshots(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); now = datetime.now(timezone.utc)
            for name, days, marker in [("snapshot-old", 8, backup.MARKER), ("snapshot-new", 1, backup.MARKER), ("snapshot-unrelated", 8, "other")]:
                folder = root / name; folder.mkdir()
                (folder / "manifest.json").write_text(json.dumps({"format": marker, "created_at": (now-timedelta(days=days)).isoformat()}))
            (root / "snapshot-link").symlink_to(root / "snapshot-unrelated")
            backup.prune(root, now)
            self.assertFalse((root / "snapshot-old").exists())
            self.assertTrue((root / "snapshot-new").exists())
            self.assertTrue((root / "snapshot-unrelated").exists())
            self.assertTrue((root / "snapshot-link").is_symlink())

if __name__ == "__main__":
    unittest.main()

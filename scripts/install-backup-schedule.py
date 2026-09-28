#!/usr/bin/env python3
"""Install the user's private daily backup LaunchAgent without storing credentials."""
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

repo = Path(__file__).resolve().parents[1]
root = Path.home() / "Documents/LionDApp-private-backups/automated"
agent = Path.home() / "Library/LaunchAgents/top.oneion.liondapp.backup.plist"
node = shutil.which("node")
if not node:
    raise SystemExit("Node.js is required")
os.umask(0o077)
root.mkdir(parents=True, exist_ok=True, mode=0o700)
agent.parent.mkdir(parents=True, exist_ok=True)
payload = {"Label": "top.oneion.liondapp.backup",
           "ProgramArguments": [sys.executable, str(repo / "scripts/backup-project.py"), "--destination", str(root), "--node", node],
           "WorkingDirectory": str(repo),
           "EnvironmentVariables": {"PATH": str(Path(node).parent) + ":/usr/bin:/bin:/usr/sbin:/sbin"},
           "StartCalendarInterval": {"Hour": 10, "Minute": 15},
           "StandardOutPath": str(root / "schedule.log"), "StandardErrorPath": str(root / "schedule-error.log"),
           "ProcessType": "Background"}
if agent.exists():
    existing = plistlib.loads(agent.read_bytes())
    if existing.get("Label") != payload["Label"] or existing.get("ProgramArguments", [None, None])[1] != payload["ProgramArguments"][1]:
        raise SystemExit("Existing schedule is different; inspect it before replacing")
agent.write_bytes(plistlib.dumps(payload))
agent.chmod(0o600)
domain = "gui/" + str(os.getuid())
subprocess.run(["launchctl", "bootout", domain, str(agent)], capture_output=True)
subprocess.run(["launchctl", "bootstrap", domain, str(agent)], check=True)
result = subprocess.run(["launchctl", "print", domain + "/" + payload["Label"]], capture_output=True)
if result.returncode:
    raise SystemExit("Schedule verification failed")
print("Daily local backup scheduled at 10:15 local time. Mac must be logged in and online; credentials must remain valid.")
print("Health file: " + str(root / "status.json"))

#!/usr/bin/env python3
"""Verify a signed release and retain public build evidence; never read a keystore."""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def find_tools(sdk):
    candidates = []
    for directory in (sdk / 'build-tools').iterdir():
        if re.fullmatch(r'\d+\.\d+\.\d+', directory.name) and all(
            (directory / tool).is_file() and os.access(directory / tool, os.X_OK)
            for tool in ('apksigner', 'aapt')
        ):
            candidates.append(directory)
    if not candidates:
        raise ValueError('Install stable Android SDK Build Tools containing apksigner and aapt')
    return max(candidates, key=lambda path: tuple(map(int, path.name.split('.')))) / 'apksigner'


def record(apk, signer, expected):
    root = Path(__file__).resolve().parents[1]
    certs = subprocess.check_output([str(signer), 'verify', '--print-certs', str(apk)], text=True)
    fingerprints = re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([a-f0-9]{64})$', certs, re.M)
    if fingerprints != [expected] or 'CN=Android Debug' in certs:
        raise ValueError('APK signer does not match the selected release certificate, or is a Debug signer')
    badging = subprocess.check_output([str(signer.parent / 'aapt'), 'dump', 'badging', str(apk)], text=True)
    identity = re.search(r"^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'", badging)
    if not identity or identity[1] != 'top.oneion.liondapp' or 'application-debuggable' in badging:
        raise ValueError('Expected the non-debuggable Store package top.oneion.liondapp')
    now = datetime.now(timezone.utc)
    destination = root / 'artifacts' / ('release-' + now.strftime('%Y%m%dT%H%M%S%fZ'))
    destination.mkdir(parents=True, exist_ok=False)
    output = destination / 'LionDApp-release.apk'
    shutil.copyfile(apk, output)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    source = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    dirty = bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).strip())
    evidence = dict(apk=str(output), package=identity[1], versionCode=int(identity[2]),
                    versionName=identity[3], apkSha256=digest, signerSha256=expected,
                    recordedAtUtc=now.isoformat(), sourceCommit=source, sourceHasUncommittedChanges=dirty,
                    storeSubmissionStatus='not submitted by this script',
                    deviceAcceptanceStatus='must be verified for this APK')
    (destination / 'release-evidence.json').write_text(json.dumps(evidence, indent=2) + '\n')
    (destination / 'LionDApp-release.apk.sha256').write_text(f'{digest}  {output.name}\n')
    print(json.dumps(evidence, indent=2))


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--find-tools':
        print(find_tools(Path(sys.argv[2]).resolve()))
        sys.exit(0)
    if len(sys.argv) != 4:
        sys.exit('Usage: record-release-artifact.py APK APKSIGNER EXPECTED_CERT_SHA256')
    record(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), sys.argv[3])

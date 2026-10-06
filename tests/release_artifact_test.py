"""Isolated signature-evidence guards; synthetic output never represents a real APK."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('release_artifact', Path(__file__).resolve().parents[1] / 'scripts/record-release-artifact.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ReleaseArtifactTest(unittest.TestCase):
    def test_pins_existing_release_certificate_before_any_build_or_archive(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            baseline = root / 'apps/mobile/release-identity.json'
            baseline.parent.mkdir(parents=True)
            baseline.write_text(json.dumps(dict(package='top.oneion.liondapp', signerSha256='a' * 64)))
            module.check_certificate(root, 'a' * 64)
            with self.assertRaisesRegex(ValueError, 'original release identity'):
                module.check_certificate(root, 'b' * 64)
            with patch.object(module, '__file__', str(root / 'scripts/record.py')), patch.object(module.subprocess, 'check_output', side_effect=AssertionError('Must reject before reading APK')):
                with self.assertRaises(ValueError):
                    module.record(root / 'app.apk', root / 'apksigner', 'b' * 64)
            self.assertFalse((root / 'artifacts').exists())

    def test_missing_or_malformed_baseline_fails_closed_for_updates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            release = root / 'artifacts/release-old/release-evidence.json'
            release.parent.mkdir(parents=True)
            release.write_text('{}')
            with self.assertRaisesRegex(ValueError, 'requires its public certificate baseline'):
                module.check_certificate(root, 'a' * 64)
            baseline = root / 'apps/mobile/release-identity.json'
            baseline.parent.mkdir(parents=True)
            for data in [dict(package='wrong', signerSha256='a' * 64), dict(package='top.oneion.liondapp', signerSha256='bad')]:
                baseline.write_text(json.dumps(data))
                with self.assertRaisesRegex(ValueError, 'malformed'):
                    module.check_certificate(root, 'a' * 64)

    def test_finds_latest_complete_stable_tools_without_external_commands(self):
        with tempfile.TemporaryDirectory() as tmp:
            sdk = Path(tmp)
            for version in ['9.0.0', '35.0.0', '36.0.0', '37.0.0-rc1', '38.0.0']:
                directory = sdk / 'build-tools' / version
                directory.mkdir(parents=True)
                for tool in ['apksigner', 'aapt']:
                    if version == '38.0.0' and tool == 'aapt':
                        continue
                    path = directory / tool
                    path.touch()
                    path.chmod(0o700)
            with patch.object(module.subprocess, 'check_output', side_effect=AssertionError('No shell tools allowed')):
                self.assertEqual(sdk / 'build-tools/36.0.0/apksigner', module.find_tools(sdk))

    def test_missing_sdk_tools_fail_before_signing(self):
        with tempfile.TemporaryDirectory() as tmp:
            sdk = Path(tmp)
            (sdk / 'build-tools').mkdir()
            with self.assertRaises(ValueError):
                module.find_tools(sdk)

    def test_rejects_wrong_debug_multiple_signers_and_wrong_package(self):
        expected = 'a' * 64
        good_cert = f'Signer #1 certificate SHA-256 digest: {expected}\n'
        good_package = "package: name='top.oneion.liondapp' versionCode='1' versionName='1.0.0'\n"
        for cert, badging in [
            (good_cert.replace(expected, 'b' * 64), good_package),
            ('Signer #1 certificate DN: CN=Android Debug\n' + good_cert, good_package),
            (good_cert + good_cert.replace('#1', '#2'), good_package),
            (good_cert, good_package.replace('top.oneion.liondapp', 'top.oneion.liondapp.dev')),
            (good_cert, good_package + 'application-debuggable\n'),
        ]:
            with self.subTest(cert=cert, badging=badging), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                with patch.object(module, '__file__', str(root / 'scripts/record.py')), patch.object(module.subprocess, 'check_output', side_effect=[cert, badging]):
                    with self.assertRaises(ValueError):
                        module.record(root / 'app.apk', root / 'apksigner', expected)
                    self.assertFalse((root / 'artifacts').exists())

    def test_records_verified_identity_hash_and_dirty_source_without_secrets(self):
        expected = 'a' * 64
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            apk = root / 'input.apk'
            apk.write_bytes(b'synthetic test artifact')
            outputs = [f'Signer #1 certificate SHA-256 digest: {expected}\n',
                       "package: name='top.oneion.liondapp' versionCode='2' versionName='1.0.1'\n",
                       'synthetic-commit\n', ' M source.kt\n']
            with patch.object(module, '__file__', str(root / 'scripts/record.py')), patch.object(module.subprocess, 'check_output', side_effect=outputs), patch('builtins.print'):
                module.record(apk, root / 'apksigner', expected)
            evidence_file = next((root / 'artifacts').glob('*/release-evidence.json'))
            evidence = json.loads(evidence_file.read_text())
            self.assertEqual(2, evidence['versionCode'])
            self.assertEqual(expected, evidence['signerSha256'])
            self.assertTrue(evidence['sourceHasUncommittedChanges'])
            self.assertEqual(apk.read_bytes(), Path(evidence['apk']).read_bytes())
            self.assertEqual(module.hashlib.sha256(apk.read_bytes()).hexdigest(), evidence['apkSha256'])


if __name__ == '__main__':
    unittest.main()

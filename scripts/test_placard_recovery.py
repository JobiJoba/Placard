"""Failure-path checks for the operator helper; no Docker access or user data."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("recovery", Path(__file__).with_name("placard-recovery.py"))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class RecoverySafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.app = {
            "Id": "fixture-app", "Image": "sha256:fixture",
            "Config": {"Image": "fixture:1", "Env": [
                "DATABASE_URL=postgres://placard:password@db:5432/placard",
                "BETTER_AUTH_SECRET=secret", "PORT=3000",
            ]},
            "Mounts": [{"Destination": f"/data/{name}", "Source": f"fixture-{name}"}
                       for name in ("media", "modules")],
        }
        self.db = {
            "Id": "fixture-db", "Image": "sha256:database",
            "Mounts": [{"Destination": "/var/lib/postgresql"}],
            "Config": {"Env": ["POSTGRES_PASSWORD=password"]},
        }
        self.args = argparse.Namespace(project="fixture", output=str(self.root / "backup"))

    def backup_context(self):
        return patch.multiple(recovery, select_project=lambda _: ("fixture", self.app),
                              service=lambda _, name: self.db if name == "db" else self.app)

    def test_failed_dump_restarts_original_and_marks_incomplete(self):
        with self.backup_context(), patch.object(recovery, "docker") as docker, \
                patch.object(recovery, "stream_to", side_effect=subprocess.CalledProcessError(1, ["pg_dump"])):
            with self.assertRaises(subprocess.CalledProcessError):
                recovery.backup(self.args)
        self.assertEqual(docker.call_args_list[-1].args, ("start", "fixture-app", "fixture-app"))
        self.assertTrue((self.root / "backup/INCOMPLETE").exists())

    def test_existing_backup_is_never_overwritten_or_stopped(self):
        (self.root / "backup").mkdir()
        with self.backup_context(), patch.object(recovery, "docker") as docker:
            with self.assertRaises(FileExistsError):
                recovery.backup(self.args)
        docker.assert_not_called()

    def test_mismatched_worker_storage_is_rejected_before_stop(self):
        worker = {**self.app, "Mounts": []}
        with patch.object(recovery, "select_project", return_value=("fixture", self.app)), \
                patch.object(recovery, "service", side_effect=[self.app, worker, self.db]), \
                patch.object(recovery, "docker") as docker:
            with self.assertRaisesRegex(ValueError, "persistent storage"):
                recovery.backup(self.args)
        docker.assert_not_called()

    def test_incomplete_restore_does_not_touch_docker(self):
        (self.root / "INCOMPLETE").touch()
        args = argparse.Namespace(backup=str(self.root), directory=str(self.root / "copy"), port=3001)
        with patch.object(recovery, "docker") as docker:
            with self.assertRaisesRegex(ValueError, "incomplete"):
                recovery.restore(args)
        docker.assert_not_called()
        self.assertFalse((self.root / "copy").exists())

    def test_corruption_is_rejected_before_destination_creation(self):
        files = ("instance.json", "database.dump", "media.tgz", "modules.tgz", "images.tar")
        for name in files:
            (self.root / name).write_bytes(b"fixture")
        sums = {name: recovery.digest(self.root / name) for name in files}
        (self.root / "checksums.json").write_text(json.dumps(sums))
        (self.root / "media.tgz").write_bytes(b"corrupted")
        args = argparse.Namespace(backup=str(self.root), directory=str(self.root / "copy"), port=3001)
        with patch.object(recovery, "docker") as docker:
            with self.assertRaisesRegex(ValueError, "verification failed"):
                recovery.restore(args)
        docker.assert_not_called()
        self.assertFalse((self.root / "copy").exists())

    def test_failed_restore_stops_only_its_random_project_and_keeps_files(self):
        record = {
            "format": 1, "app_image": "sha256:fixture", "db_image": "sha256:db",
            "app_environment": {"BETTER_AUTH_SECRET": "test$literal"},
            "db_environment": {"POSTGRES_PASSWORD": "secret"},
            "db_user": "placard", "db_name": "placard",
        }
        (self.root / "instance.json").write_text(json.dumps(record))
        for name in ("database.dump", "media.tgz", "modules.tgz", "images.tar"):
            (self.root / name).write_bytes(b"fixture")
        files = ("instance.json", "database.dump", "media.tgz", "modules.tgz", "images.tar")
        (self.root / "checksums.json").write_text(json.dumps({name: recovery.digest(self.root / name) for name in files}))
        args = argparse.Namespace(backup=str(self.root), directory=str(self.root / "copy"), port=3001)
        def fail_loading(*commands, **_):
            if commands[:2] == ("image", "load"):
                raise subprocess.CalledProcessError(1, ["docker", "image", "load"])
        with patch.object(recovery, "docker", side_effect=fail_loading) as docker:
            with self.assertRaises(subprocess.CalledProcessError):
                recovery.restore(args)
        stopped = docker.call_args_list[-1].args
        self.assertEqual(stopped[0], "compose")
        self.assertEqual(stopped[-1], "stop")
        project = stopped[stopped.index("-p") + 1]
        self.assertTrue(project.startswith("placard-recovery-"))
        config = json.loads((self.root / "copy/compose.json").read_text())
        self.assertTrue(config["networks"]["default"]["internal"])
        self.assertNotIn("ports", config["services"]["app"])
        self.assertEqual(config["services"]["preview"]["ports"], ["127.0.0.1:3001:3000"])
        self.assertEqual(config["services"]["app"]["environment"]["BETTER_AUTH_SECRET"], "test$$literal")

    def test_compose_values_preserve_literal_dollars_in_secrets(self):
        self.assertEqual(recovery.escape_compose({"PASSWORD": "a$B${C}"}), {"PASSWORD": "a$$B$${C}"})


if __name__ == "__main__":
    os.umask(0o077)
    unittest.main()

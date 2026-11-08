#!/usr/bin/env python3
"""Dependency-free operator backup and isolated recovery for standard Placard stacks."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import signal
import subprocess
import sys
from urllib.parse import urlsplit


def docker(*args, output=None, input_file=None, capture=True):
    return subprocess.run(
        ["docker", *args], check=True, stdin=input_file,
        stdout=output if output else (subprocess.PIPE if capture else None),
    ).stdout


def inspect(container):
    return json.loads(docker("inspect", container))[0]


def environment(container):
    return dict(entry.split("=", 1) for entry in container["Config"]["Env"] if "=" in entry)


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def stream_to(path, *args):
    with path.open("wb") as stream:
        docker(*args, output=stream)


def select_project(requested):
    ids = docker("ps", "-q", "--filter", "label=com.docker.compose.service=app").decode().split()
    projects = {}
    for container in ids:
        record = inspect(container)
        env = environment(record)
        if "DATABASE_URL" in env and "BETTER_AUTH_SECRET" in env and env.get("PORT") == "3000":
            project = record["Config"]["Labels"].get("com.docker.compose.project")
            if project:
                projects[project] = record
    if requested:
        if requested not in projects:
            raise ValueError("No running standard Placard app found in that project.")
        return requested, projects[requested]
    choices = sorted(projects)
    if not choices:
        raise ValueError("No running Placard Compose project found on this Docker host.")
    # Always select explicitly, even if only one instance is present.
    if not sys.stdin.isatty():
        raise ValueError("Use --project NAME (run 'docker compose ls' to find it).")
    for index, name in enumerate(choices, 1):
        print(f"  {index}. {name}")
    answer = input("Which Placard instance should be backed up? ").strip()
    if not answer.isdigit() or not 1 <= int(answer) <= len(choices):
        raise ValueError("Invalid selection; nothing changed.")
    project = choices[int(answer) - 1]
    return project, projects[project]


def service(project, name):
    ids = docker("ps", "-q", "--filter", f"label=com.docker.compose.project={project}",
                 "--filter", f"label=com.docker.compose.service={name}").decode().split()
    if len(ids) != 1:
        raise ValueError(f"Expected exactly one running {name} service; nothing changed.")
    return inspect(ids[0])


def backup(args):
    project, _ = select_project(args.project)
    app = service(project, "app")
    worker = service(project, "worker")
    db = service(project, "db")
    app_env, db_env = environment(app), environment(db)
    if app["Image"] != worker["Image"]:
        raise ValueError("App and worker images differ; align their versions before backup.")
    for name, default in (("MEDIA_DIR", "/data/media"), ("PLACARD_MODULES_DIR", "/data/modules")):
        if app_env.get(name, default) != default:
            raise ValueError("This helper requires the standard media and module mount paths.")
        mounts = [m for m in app["Mounts"] if m["Destination"] == default]
        other = [m for m in worker["Mounts"] if m["Destination"] == default]
        if len(mounts) != 1 or len(other) != 1 or mounts[0]["Source"] != other[0]["Source"]:
            raise ValueError("App and worker must share the standard persistent storage.")
    if not any(m["Destination"] == "/var/lib/postgresql" for m in db["Mounts"]):
        raise ValueError("This helper requires the standard PostgreSQL 18 storage mount.")
    if environment(worker).get("DATABASE_URL") != app_env.get("DATABASE_URL"):
        raise ValueError("App and worker must use the same bundled database.")
    if not db_env.get("POSTGRES_PASSWORD"):
        raise ValueError("The standard POSTGRES_PASSWORD environment setting is required.")
    user, database = db_env.get("POSTGRES_USER", "placard"), db_env.get("POSTGRES_DB", "placard")
    url = urlsplit(app_env["DATABASE_URL"])
    if url.hostname != "db" or url.path != f"/{database}":
        raise ValueError("This helper requires the bundled database at hostname db.")
    target = Path(args.output).resolve()
    for mount in app["Mounts"]:
        source = mount.get("Source")
        if source and target.is_relative_to(Path(source).resolve()):
            raise ValueError("Choose a backup directory outside the instance's mounted data.")
    target.mkdir(mode=0o700)  # Fail on an existing path; never replace a backup.
    print(f"Backing up {project} to {target}", flush=True)
    # Mark incomplete until all data, images, and checksums are written.
    (target / "INCOMPLETE").touch()
    write_json(target / "instance.json", {
        "format": 1, "project": project, "app_image": app["Image"], "db_image": db["Image"],
        "app_environment": app_env, "db_environment": db_env,
        "app_image_reference": app["Config"]["Image"],
        "db_user": user, "db_name": database,
    })
    try:
        # The finally block also runs if stopping only one container succeeds.
        docker("stop", app["Id"], worker["Id"])
        stream_to(target / "database.dump", "exec", db["Id"], "pg_dump", "-U", user, "-Fc", database)
        for name in ("media", "modules"):
            stream_to(target / f"{name}.tgz", "run", "--rm", "--network", "none",
                      "--volumes-from", f'{app["Id"]}:ro', "--entrypoint", "tar",
                      app["Image"], "czf", "-", "-C", f"/data/{name}", ".")
        with (target / "database.dump").open("rb") as stream:
            docker("exec", "-i", db["Id"], "pg_restore", "--list", input_file=stream)
        for name in ("media", "modules"):
            with (target / f"{name}.tgz").open("rb") as stream:
                docker("run", "--rm", "-i", "--network", "none", "--entrypoint", "tar",
                       app["Image"], "tzf", "-", input_file=stream)
    finally:
        print("Restarting original app and worker…", flush=True)
        docker("start", app["Id"], worker["Id"])
    print("Saving exact app/database images; the original instance is running again…", flush=True)
    stream_to(target / "images.tar", "image", "save", app["Image"], db["Image"])
    files = ("instance.json", "database.dump", "media.tgz", "modules.tgz", "images.tar")
    write_json(target / "checksums.json", {name: digest(target / name) for name in files})
    (target / "INCOMPLETE").unlink()
    print(f"Backup complete: {target}\nKeep this folder private and copy it off the server.")


def escape_compose(value):
    # Compose interpolates values even in JSON; preserve literal dollars in secrets.
    if isinstance(value, str):
        return value.replace("$", "$$")
    if isinstance(value, dict):
        return {key: escape_compose(item) for key, item in value.items()}
    if isinstance(value, list):
        return [escape_compose(item) for item in value]
    return value


def restore(args):
    source = Path(args.backup).resolve()
    if (source / "INCOMPLETE").exists():
        raise ValueError("Backup is incomplete; use a completed backup.")
    expected = {"instance.json", "database.dump", "media.tgz", "modules.tgz", "images.tar"}
    sums = json.loads((source / "checksums.json").read_text())
    if set(sums) != expected:
        raise ValueError("Unexpected backup file list.")
    print("Verifying backup checksums…", flush=True)
    for name in sorted(expected):
        path = source / name
        if path.is_symlink() or digest(path) != sums[name]:
            raise ValueError(f"Backup verification failed: {name}")
    record = json.loads((source / "instance.json").read_text())
    if record.get("format") != 1:
        raise ValueError("Unsupported backup format.")
    target = Path(args.directory).resolve()
    target.mkdir(mode=0o700)  # A fresh destination is mandatory.
    project = f"placard-recovery-{secrets.token_hex(8)}"
    app_env = dict(record["app_environment"])
    app_env.update({
        "PUBLIC_URL": f"http://localhost:{args.port}", "PORT": "3000",
        "MEDIA_DIR": "/data/media", "PLACARD_MODULES_DIR": "/data/modules",
        "GOOGLE_MAPS_API_KEY": "", "MCP_ENABLED": "false",
    })
    db_env = {key: value for key, value in record["db_environment"].items()
              if key in ("POSTGRES_USER", "POSTGRES_DB", "POSTGRES_PASSWORD")}
    health = {"interval": "5s", "timeout": "5s", "retries": 30, "start_period": "20s"}
    app = {
        "image": record["app_image"], "pull_policy": "never", "environment": app_env,
        "volumes": ["media:/data/media", "modules:/data/modules"],
        "depends_on": {"db": {"condition": "service_healthy"}},
        "healthcheck": {**health, "test": ["CMD", "node", "-e",
            "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]},
    }
    compose = {
        "name": project,
        "services": {
            "db": {"image": record["db_image"], "pull_policy": "never", "environment": db_env,
                   "volumes": ["pgdata:/var/lib/postgresql"],
                   "healthcheck": {**health, "test": ["CMD", "pg_isready", "-U", record["db_user"], "-d", record["db_name"]]}},
            "app": app,
            "worker": {**app, "command": ["node", "apps/server/src/worker.ts"],
                       "environment": {**app_env, "WORKER_HEARTBEAT_FILE": "/tmp/placard-worker-heartbeat"},
                       "depends_on": {"app": {"condition": "service_healthy"}},
                       "healthcheck": {**health, "test": ["CMD", "node", "-e",
                           "const s=require('fs').statSync('/tmp/placard-worker-heartbeat',{throwIfNoEntry:false});process.exit(s&&Date.now()-s.mtimeMs<30000?0:1)"]}},
        },
        "volumes": {"pgdata": {}, "media": {}, "modules": {}},
        "networks": {"default": {"internal": True}, "preview": {}},
    }
    # A tiny fixed-target proxy exposes the preview on Docker Desktop as well as Linux.
    # Only this proxy has an external network; restored app/jobs stay on the internal one.
    proxy_code = (
        "const h=require('node:http');h.createServer((q,s)=>{"
        "const p=h.request({hostname:'app',port:3000,path:q.url,method:q.method,headers:q.headers},r=>{"
        "s.writeHead(r.statusCode,r.headers);r.pipe(s)});"
        "p.on('error',()=>{s.writeHead(502);s.end('Recovery app unavailable')});q.pipe(p)"
        "}).listen(3000,'0.0.0.0')"
    )
    compose["services"]["preview"] = {
        "image": record["app_image"], "pull_policy": "never",
        "command": ["node", "-e", proxy_code],
        "ports": [f"127.0.0.1:{args.port}:3000"], "networks": ["default", "preview"],
        "depends_on": {"app": {"condition": "service_healthy"}},
        "healthcheck": app["healthcheck"],
    }
    compose_file = target / "compose.json"
    write_json(compose_file, escape_compose(compose))
    (target / "empty.env").write_text("")
    write_json(target / "recovery.json", {"project": project, "port": args.port, "source": str(source)})
    # Use a new project, explicit files and empty env file; production Compose overrides cannot leak in.
    base = ["compose", "--env-file", str(target / "empty.env"), "-p", project, "-f", str(compose_file)]
    def run(*commands, **kwargs):
        return docker(*base, *commands, **kwargs)
    print(f"Restoring a separate instance ({project}) in {target}…", flush=True)
    try:
        with (source / "images.tar").open("rb") as stream:
            docker("image", "load", input_file=stream)
        run("up", "-d", "--wait", "db", capture=False)
        with (source / "database.dump").open("rb") as stream:
            run("exec", "-T", "db", "pg_restore", "-U", record["db_user"], "-d", record["db_name"],
                "--clean", "--if-exists", "--no-owner", "--exit-on-error", input_file=stream)
        for name in ("media", "modules"):
            with (source / f"{name}.tgz").open("rb") as stream:
                run("run", "--rm", "--no-deps", "-T", "app", "tar", "xzf", "-", "-C",
                    f"/data/{name}", input_file=stream)
        run("up", "-d", "--wait", capture=False)
    except BaseException:
        print(f"Restore failed. Stopping only recovery project {project}; keeping its files and volumes.", file=sys.stderr)
        run("stop", capture=False)
        raise
    print(f"Recovery copy ready: http://localhost:{args.port}\nSign in with your existing account and verify places, photos, and modules.")
    print(f"Original instance unchanged. To stop the copy:\n  docker compose -p {project} -f '{compose_file}' stop")


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    save = commands.add_parser("backup", help="Back up a running Compose/Coolify instance")
    save.add_argument("--project", help="Compose project name; otherwise choose interactively")
    save.add_argument("--output", required=True, help="New backup directory (must not exist)")
    recover = commands.add_parser("restore", help="Restore a trusted backup into a separate local copy")
    recover.add_argument("backup", help="Completed backup directory")
    recover.add_argument("--directory", required=True, help="New recovery directory (must not exist)")
    recover.add_argument("--port", type=int, default=3001)
    args = parser.parse_args()
    if args.command == "restore" and not 1024 <= args.port <= 65535:
        parser.error("Choose a port between 1024 and 65535.")
    docker("info", "--format", "{{.ServerVersion}}")
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(1))
    if args.command == "backup":
        backup(args)
    else:
        restore(args)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError, KeyboardInterrupt) as error:
        print(f"Recovery helper stopped: {error}", file=sys.stderr)
        sys.exit(1)

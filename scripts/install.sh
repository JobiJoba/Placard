#!/usr/bin/env bash
# Published copies are pinned by prepare-release-assets.mjs.
set -euo pipefail
RELEASE='@PLACARD_RELEASE@'
REPOSITORY='@PLACARD_REPOSITORY@'
directory='./placard-app'; port=3000; public_url=''; access=local; unattended=false
fail() { printf 'Placard: %s\n' "$*" >&2; exit 1; }
usage() { echo 'install.sh [--directory PATH] [--port PORT] [--public-url ORIGIN] [--access local|network] [--non-interactive]'; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --non-interactive) unattended=true; shift ;;
    --help|-h) usage; exit 0 ;;
    --directory|--port|--public-url|--access)
      [ "$#" -ge 2 ] || fail "Missing value for $1"
      case "$1" in --directory) directory=$2;; --port) port=$2;; --public-url) public_url=$2;; --access) access=$2;; esac
      shift 2 ;;
    *) fail "Unknown option: $1" ;;
  esac
done
[[ "$RELEASE" != @* ]] || fail 'Download this installer from a GitHub Release.'
for command in docker curl od tr mktemp; do command -v "$command" >/dev/null || fail "Missing $command. Docker setup: https://docs.docker.com/compose/install/"; done
info=$(docker info --format '{{.OSType}}/{{.Architecture}}') || fail 'Start Docker and check your daemon permissions.'
case "$info" in linux/x86_64|linux/amd64|linux/aarch64|linux/arm64) ;; *) fail "Unsupported Docker daemon: $info. Use AMD64/ARM64 Linux containers.";; esac
help=$(docker compose up --help) || fail 'Install Docker Compose v2.'
[[ "$help" == *--wait-timeout* ]] || fail 'Update Docker Compose to a version supporting --wait-timeout.'
# Never let inherited Compose or app settings change the selected stack or secrets.
for key in COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_ENV_FILES PLACARD_IMAGE POSTGRES_PASSWORD BETTER_AUTH_SECRET PUBLIC_URL PLACARD_PORT PLACARD_BIND_ADDRESS; do
  [ -z "${!key:-}" ] || fail "Unset $key before running the installer."
done
containers=$(docker ps -aq --filter label=com.docker.compose.project=placard)
volumes=$(docker volume ls -q --filter label=com.docker.compose.project=placard)
[ -z "$containers$volumes" ] || fail 'An existing placard project was found. Use the documented backup and upgrade procedure.'
for volume in placard_pgdata placard_media placard_modules; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then fail "Existing volume $volume found; refusing to reuse data."; fi
done
prompt() { local answer; read -r -p "$1 [$2]: " answer </dev/tty || fail 'No interactive terminal; use --non-interactive.'; printf '%s' "${answer:-$2}"; }
if ! $unattended; then
  directory=$(prompt 'Installation directory' "$directory")
  port=$(prompt 'Host port' "$port")
  public_url=$(prompt 'Public URL' "${public_url:-http://localhost:$port}")
  access=$(prompt 'Access (local or network)' "$access")
fi
public_url=${public_url:-http://localhost:$port}
[[ "$port" =~ ^[1-9][0-9]{0,4}$ ]] && [ "$port" -le 65535 ] || fail 'Port must be between 1 and 65535.'
[[ "$public_url" =~ ^https?://(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(:[1-9][0-9]{0,4})?$ ]] || fail 'Public URL must be an http(s) origin without path, credentials, query, or trailing slash.'
if [[ "$public_url" =~ :([0-9]+)$ ]]; then
  [ "${BASH_REMATCH[1]}" -le 65535 ] || fail 'Public URL port must be between 1 and 65535.'
fi
case "$access" in local) bind=127.0.0.1;; network) bind=0.0.0.0;; *) fail 'Access must be local or network.';; esac
[ -n "$directory" ] || fail 'Installation directory cannot be empty.'
if [ -e "$directory" ]; then fail 'Destination already exists. Choose a new directory; existing installations must be managed manually.'; fi
umask 077
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
base="https://github.com/$REPOSITORY/releases/download/$RELEASE"
for asset in docker-compose.yml example.env; do
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' "$base/$asset" -o "$stage/$asset" || fail "Download failed: $asset. No installation files were created."
  [ -s "$stage/$asset" ] || fail "Empty release asset: $asset"
done
secret() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }
password=$(secret); auth=$(secret)
# Keep optional release defaults while replacing only the installer-owned fields.
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in POSTGRES_PASSWORD=*|BETTER_AUTH_SECRET=*|PUBLIC_URL=*|PLACARD_PORT=*|PLACARD_BIND_ADDRESS=*) ;; *) printf '%s\n' "$line";; esac
done < "$stage/example.env" > "$stage/.env"
printf '\nPOSTGRES_PASSWORD=%s\nBETTER_AUTH_SECRET=%s\nPUBLIC_URL=%s\nPLACARD_PORT=%s\nPLACARD_BIND_ADDRESS=%s\n' "$password" "$auth" "$public_url" "$port" "$bind" >> "$stage/.env"
mkdir -p "$(dirname "$directory")"
mkdir "$directory" || fail 'Could not create a fresh installation directory.'
cp "$stage/docker-compose.yml" "$stage/example.env" "$stage/.env" "$directory/"
cd "$directory"
compose() { docker compose --project-name placard --env-file .env -f docker-compose.yml "$@"; }
recover() { echo "Installation retained at: $(pwd)"; echo 'Run here: docker compose ps; docker compose logs --tail=100'; echo 'After correcting the problem: docker compose up -d --wait'; }
if ! compose config --quiet || ! compose pull || ! compose up -d --wait --wait-timeout 180; then
  recover; fail 'Startup failed. Check Docker, available ports, and logs. Your configuration and volumes have been preserved.'
fi
printf '\nPlacard is healthy. Installation: %s\nURL: %s\n' "$(pwd)" "$public_url"
echo 'Create your administrator account before exposing the instance. External DNS/TLS has not been verified.'
echo 'From the installation directory: docker compose ps; docker compose logs --tail=100; docker compose stop'

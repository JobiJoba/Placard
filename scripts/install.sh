#!/usr/bin/env bash
# Published copies are pinned by prepare-release-assets.mjs.
set -euo pipefail
RELEASE='@PLACARD_RELEASE@'
REPOSITORY='@PLACARD_REPOSITORY@'
directory='./placard-app'; port=3000; public_url=''; access=local; https_domain=''; unattended=false
fail() { printf 'Placard: %s\n' "$*" >&2; exit 1; }
usage() { echo 'install.sh [--directory PATH] [--port PORT] [--public-url ORIGIN] [--access local|network] [--https-domain DOMAIN] [--non-interactive]'; }
while [ "$#" -gt 0 ]; do
  case "$1" in
    --non-interactive) unattended=true; shift ;;
    --help|-h) usage; exit 0 ;;
    --directory|--port|--public-url|--access|--https-domain)
      [ "$#" -ge 2 ] || fail "Missing value for $1"
      case "$1" in --directory) directory=$2;; --port) port=$2;; --public-url) public_url=$2;; --access) access=$2;; --https-domain) https_domain=$2;; esac
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
for key in COMPOSE_FILE COMPOSE_PROJECT_NAME COMPOSE_ENV_FILES PLACARD_IMAGE POSTGRES_PASSWORD BETTER_AUTH_SECRET PUBLIC_URL PLACARD_PORT PLACARD_BIND_ADDRESS PLACARD_DOMAIN; do
  [ -z "${!key:-}" ] || fail "Unset $key before running the installer."
done
containers=$(docker ps -aq --filter label=com.docker.compose.project=placard)
volumes=$(docker volume ls -q --filter label=com.docker.compose.project=placard)
[ -z "$containers$volumes" ] || fail 'An existing placard project was found. Use the documented backup and upgrade procedure.'
for volume in placard_pgdata placard_media placard_modules placard_caddy_data placard_caddy_config; do
  if docker volume inspect "$volume" >/dev/null 2>&1; then fail "Existing volume $volume found; refusing to reuse data."; fi
done
prompt() { local answer; read -r -p "$1 [$2]: " answer </dev/tty || fail 'No interactive terminal; use --non-interactive.'; printf '%s' "${answer:-$2}"; }
if ! $unattended; then
  directory=$(prompt 'Installation directory' "$directory")
  port=$(prompt 'Host port' "$port")
  https_domain=$(prompt 'HTTPS domain (blank for HTTP or an existing reverse proxy)' "$https_domain")
  if [ -z "$https_domain" ]; then
    public_url=$(prompt 'Public URL' "${public_url:-http://localhost:$port}")
    access=$(prompt 'Access (local or network)' "$access")
  fi
fi
if [ -n "$https_domain" ]; then
  [[ ${#https_domain} -le 253 && "$https_domain" =~ ^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$ ]] || fail 'HTTPS requires a public DNS domain, without scheme, port, or path.'
  case "$https_domain" in *.[Ll][Oo][Cc][Aa][Ll]|*.[Ll][Oo][Cc][Aa][Ll][Hh][Oo][Ss][Tt]|*.[Ii][Nn][Tt][Ee][Rr][Nn][Aa][Ll]|*.[Tt][Ee][Ss][Tt]|*.[Ii][Nn][Vv][Aa][Ll][Ii][Dd]|*.[Hh][Oo][Mm][Ee].[Aa][Rr][Pp][Aa]) fail 'Use a public DNS domain for automatic HTTPS.';; esac
  [ -z "$public_url" ] || [ "$public_url" = "https://$https_domain" ] || fail 'Public URL must match the HTTPS domain.'
  public_url="https://$https_domain"; access=local
  [ "$port" != 80 ] && [ "$port" != 443 ] || fail 'HTTPS reserves host ports 80 and 443; choose another app port.'
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
assets=(docker-compose.yml example.env)
if [ -n "$https_domain" ]; then assets+=(docker-compose.override.yml Caddyfile); fi
for asset in "${assets[@]}"; do
  if ! curl --fail --silent --show-error --location --connect-timeout 10 --max-time 30 --proto '=https' --proto-redir '=https' "$base/$asset" -o "$stage/$asset"; then
    api_url=''
    case "$asset" in
      docker-compose.yml) api_url='@PLACARD_COMPOSE_API@';;
      example.env) api_url='@PLACARD_ENV_API@';;
      docker-compose.override.yml) api_url='@PLACARD_HTTPS_API@';;
      Caddyfile) api_url='@PLACARD_CADDY_API@';;
    esac
    [[ "$api_url" == https://api.github.com/repos/"$REPOSITORY"/releases/assets/* ]] || fail "Download failed: $asset. No API fallback is available in this installer."
    printf 'Release download failed for %s; retrying the same asset through GitHub API…\n' "$asset" >&2
    curl --fail --silent --show-error --location --retry 2 --connect-timeout 10 --max-time 30 --proto '=https' --proto-redir '=https' -H 'Accept: application/octet-stream' "$api_url" -o "$stage/$asset" || fail "Download failed: $asset (release and API). No installation files were created."
  fi
  [ -s "$stage/$asset" ] || fail "Empty release asset: $asset"
done
secret() { od -An -N32 -tx1 /dev/urandom | tr -d ' \n'; }
password=$(secret); auth=$(secret)
# Keep optional release defaults while replacing only the installer-owned fields.
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in POSTGRES_PASSWORD=*|BETTER_AUTH_SECRET=*|PUBLIC_URL=*|PLACARD_PORT=*|PLACARD_BIND_ADDRESS=*|PLACARD_DOMAIN=*) ;; *) printf '%s\n' "$line";; esac
done < "$stage/example.env" > "$stage/.env"
printf '\nPOSTGRES_PASSWORD=%s\nBETTER_AUTH_SECRET=%s\nPUBLIC_URL=%s\nPLACARD_PORT=%s\nPLACARD_BIND_ADDRESS=%s\n' "$password" "$auth" "$public_url" "$port" "$bind" >> "$stage/.env"
if [ -n "$https_domain" ]; then printf 'PLACARD_DOMAIN=%s\n' "$https_domain" >> "$stage/.env"; fi
mkdir -p "$(dirname "$directory")"
mkdir "$directory" || fail 'Could not create a fresh installation directory.'
for asset in "${assets[@]}" .env; do cp "$stage/$asset" "$directory/"; done
cd "$directory"
compose_files=(-f docker-compose.yml)
if [ -n "$https_domain" ]; then compose_files+=(-f docker-compose.override.yml); fi
compose() { docker compose --project-name placard --env-file .env "${compose_files[@]}" "$@"; }
recover() { echo "Installation retained at: $(pwd)"; echo 'Run here: docker compose ps; docker compose logs --tail=100'; echo 'After correcting the problem: docker compose up -d --wait'; }
if ! compose config --quiet || ! compose pull || ! compose up -d --wait --wait-timeout 180; then
  recover; fail 'Startup failed. Check Docker, available ports, and logs. Your configuration and volumes have been preserved.'
fi
printf '\nPlacard is healthy. Installation: %s\nURL: %s\n' "$(pwd)" "$public_url"
if [ -n "$https_domain" ]; then
  echo 'Caddy is configured for automatic HTTPS. Point domain DNS to this server and allow inbound TCP ports 80 and 443.'
  echo 'Certificate issuance may still be pending. Check: docker compose logs --tail=100 caddy'
fi
echo 'Create your administrator account before exposing the instance. External DNS/TLS has not been verified.'
echo 'From the installation directory: docker compose ps; docker compose logs --tail=100; docker compose stop'

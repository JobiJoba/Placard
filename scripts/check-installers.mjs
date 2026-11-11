import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const shell = process.argv[2] || "bash"
// A pwsh parent exports its module paths. Let each child discover modules for its
// own runtime, especially Windows PowerShell 5.1 launched from PowerShell 7.
const childEnv = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => key.toLowerCase() !== "psmodulepath"),
)
const root = resolve(import.meta.dirname, "..")
const temp = mkdtempSync(join(tmpdir(), "placard-install-test-"))
const bin = join(temp, "bin")
mkdirSync(bin)
const fixture = readFileSync(join(root, "compose.ghcr.yaml"), "utf8")
const example = readFileSync(join(root, ".env.example"), "utf8")
// Real process boundary for Docker; downloads are replaced without using the network.
const mock = `const a=process.argv.slice(2); const mode=process.env.INSTALL_TEST_MODE;
require('fs').appendFileSync(process.env.INSTALL_TEST_LOG, JSON.stringify(a)+'\\n');
if(a[0]==='info') {if(mode==='daemon') process.exit(1); console.log(mode==='windows'?'windows/amd64':mode==='arch'?'linux/armv7':'linux/amd64')}
else if(a.includes('--help')) console.log(mode==='old'?'':'--wait-timeout');
else if(a[0]==='ps' && mode==='existing') console.log('container');
else if(a[0]==='volume' && a[1]==='inspect') process.exit(mode==='volume'?0:1);
else if(a.includes('up') && mode==='timeout') process.exit(1);
else if(a.includes('pull') && mode==='pull') process.exit(1);
else if(a.includes('config') && mode==='config') process.exit(1);
`
writeFileSync(join(bin, "docker.cjs"), mock)
if (process.platform === "win32")
  writeFileSync(join(bin, "docker.cmd"), `@"${process.execPath}" "%~dp0docker.cjs" %*\r\n`)
else
  writeFileSync(
    join(bin, "docker"),
    `#!/bin/sh\nexec '${process.execPath}' '${join(bin, "docker.cjs")}' "$@"\n`,
    { mode: 0o755 },
  )
writeFileSync(
  join(bin, "curl"),
  `#!/bin/bash
printf '%s\\n' "$*" >> "$INSTALL_TEST_LOG"
url=''; out=''; while [ "$#" -gt 0 ]; do case "$1" in https:*) url=$1;; -o) shift; out=$1;; esac; shift; done
[ "$INSTALL_TEST_MODE" != download ] || exit 22
if [ "$INSTALL_TEST_MODE" = fallback ] && [[ "$url" == */releases/download/* ]]; then exit 22; fi
case "$url" in
*/docker-compose.override.yml|*/assets/103) cp '${join(temp, "docker-compose.override.yml")}' "$out";;
*/Caddyfile|*/assets/104) cp '${join(temp, "Caddyfile")}' "$out";;
*/example.env|*/assets/102) cp '${join(temp, "example.env")}' "$out";;
*) cp '${join(temp, "compose.yml")}' "$out";; esac
`,
  { mode: 0o755 },
)
writeFileSync(join(temp, "example.env"), example)
writeFileSync(join(temp, "compose.yml"), fixture)
for (const [source, target] of [
  ["compose.https.yaml", "docker-compose.override.yml"],
  ["Caddyfile", "Caddyfile"],
]) {
  writeFileSync(join(temp, target), readFileSync(join(root, source)))
}
let source = readFileSync(join(root, `scripts/install.${shell === "bash" ? "sh" : "ps1"}`), "utf8")
  .replaceAll("@PLACARD_RELEASE@", "v1.2.3")
  .replaceAll("@PLACARD_REPOSITORY@", "placard-app/core")
  .replaceAll(
    "@PLACARD_COMPOSE_API@",
    "https://api.github.com/repos/placard-app/core/releases/assets/101",
  )
  .replaceAll(
    "@PLACARD_ENV_API@",
    "https://api.github.com/repos/placard-app/core/releases/assets/102",
  )
  .replaceAll(
    "@PLACARD_HTTPS_API@",
    "https://api.github.com/repos/placard-app/core/releases/assets/103",
  )
  .replaceAll(
    "@PLACARD_CADDY_API@",
    "https://api.github.com/repos/placard-app/core/releases/assets/104",
  )
if (shell !== "bash")
  source = `function Invoke-WebRequest { param($Uri,$OutFile,$TimeoutSec,$Headers,[switch]$UseBasicParsing)
if ($env:INSTALL_TEST_MODE -eq 'download') { throw 'download failed' }
Add-Content -LiteralPath $env:INSTALL_TEST_LOG -Value $Uri
if ($env:INSTALL_TEST_MODE -eq 'fallback' -and $Uri.Contains('/releases/download/')) { throw '504 Gateway Timeout' }
$Name = if (($Uri.EndsWith('example.env') -or $Uri.EndsWith('/assets/102'))) { 'example.env' } elseif (($Uri.EndsWith('docker-compose.override.yml') -or $Uri.EndsWith('/assets/103'))) { 'docker-compose.override.yml' } elseif (($Uri.EndsWith('Caddyfile') -or $Uri.EndsWith('/assets/104'))) { 'Caddyfile' } else { 'compose.yml' }
Copy-Item -LiteralPath (Join-Path $env:INSTALL_TEST_FIXTURES $Name) -Destination $OutFile
}
& {\n${source}\n} @args\n`
const script = join(temp, shell === "bash" ? "install.sh" : "install.ps1")
writeFileSync(script, source)
function run(mode, destination, extra = []) {
  const log = join(temp, "calls.log")
  writeFileSync(log, "")
  const args =
    shell === "bash"
      ? [script, "--non-interactive", "--directory", destination, ...extra]
      : ["-NoProfile", "-File", script, "-NonInteractive", "-Directory", destination, ...extra]
  const result = spawnSync(shell, args, {
    encoding: "utf8",
    env: {
      ...childEnv,
      PATH: `${bin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH}`,
      INSTALL_TEST_MODE: mode,
      INSTALL_TEST_LOG: log,
      INSTALL_TEST_FIXTURES: temp,
    },
  })
  return { ...result, log: readFileSync(log, "utf8") }
}
try {
  for (const mode of ["daemon", "windows", "arch", "old", "existing", "volume", "download"]) {
    const dest = join(temp, mode)
    const r = run(mode, dest)
    assert.notEqual(r.status, 0, mode)
    assert.equal(existsSync(dest), false, mode)
  }
  for (const [name, option, value] of [
    ["port", "port", "0"],
    ["url", "public-url", "https://bad/path"],
  ]) {
    const dest = join(temp, name)
    const opt = shell === "bash" ? `--${option}` : option === "port" ? "-Port" : "-PublicUrl"
    assert.notEqual(run("", dest, [opt, value]).status, 0)
    assert.equal(existsSync(dest), false)
  }
  for (const mode of ["success", "fallback", "timeout", "pull", "config"]) {
    const dest = join(temp, `${mode} with spaces`)
    const extra =
      mode === "success"
        ? shell === "bash"
          ? ["--port", "3456", "--public-url", "https://places.example.com", "--access", "network"]
          : ["-Port", "3456", "-PublicUrl", "https://places.example.com", "-Access", "network"]
        : []
    const r = run(mode, dest, extra)
    assert.equal(r.status, mode === "success" || mode === "fallback" ? 0 : 1, r.stdout + r.stderr)
    const env = readFileSync(join(dest, ".env"), "utf8")
    const password = env.match(/^POSTGRES_PASSWORD=([a-f0-9]{64})$/m)?.[1]
    const auth = env.match(/^BETTER_AUTH_SECRET=([a-f0-9]{64})$/m)?.[1]
    assert.ok(password && auth && password !== auth)
    assert.ok(!r.stdout.includes(password) && !r.stderr.includes(auth))
    assert.match(r.log, /releases\/download\/v1.2.3\/example.env/)
    assert.match(
      env,
      mode === "success" ? /PLACARD_BIND_ADDRESS=0.0.0.0/ : /PLACARD_BIND_ADDRESS=127.0.0.1/,
    )
    assert.equal(existsSync(join(dest, "docker-compose.override.yml")), false)
    assert.equal(existsSync(join(dest, "Caddyfile")), false)
    if (process.platform !== "win32") assert.equal(statSync(join(dest, ".env")).mode & 0o777, 0o600)
    if (process.platform === "win32") {
      const acl = spawnSync(
        shell,
        [
          "-NoProfile",
          "-Command",
          "$acl = Get-Acl -LiteralPath $env:INSTALL_TEST_ENV; $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User; foreach ($rule in $acl.Access) { if ($rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value -ne $sid.Value) { exit 1 } }; if ($acl.Access.Count -eq 0) { exit 1 }",
        ],
        { env: { ...childEnv, INSTALL_TEST_ENV: join(dest, ".env") }, encoding: "utf8" },
      )
      assert.equal(acl.status, 0, acl.stdout + acl.stderr)
    }
    const repeated = run("", dest)
    assert.notEqual(repeated.status, 0)
    assert.equal(readFileSync(join(dest, ".env"), "utf8"), env)
  }
  const httpsOption = shell === "bash" ? "--https-domain" : "-HttpsDomain"
  const portOption = shell === "bash" ? "--port" : "-Port"
  const urlOption = shell === "bash" ? "--public-url" : "-PublicUrl"
  for (const [index, extra] of [
    [httpsOption, "localhost"],
    [httpsOption, "127.0.0.1"],
    [httpsOption, "places.local"],
    [httpsOption, "places.LOCALHOST"],
    [httpsOption, "https://places.example.com"],
    [httpsOption, "places.example.com/path"],
    [httpsOption, "places.example.com:443"],
    [httpsOption, "-bad.example.com"],
    [httpsOption, `${"x".repeat(64)}.example.com`],
    [httpsOption, "places.example.com", portOption, "443"],
    [httpsOption, "places.example.com", portOption, "80"],
    [httpsOption, "places.example.com", urlOption, "https://other.example.com"],
  ].entries()) {
    const dest = join(temp, `invalid-https-${index}`)
    assert.notEqual(run("", dest, extra).status, 0)
    assert.equal(existsSync(dest), false)
  }
  const httpsDest = join(temp, "https with spaces")
  const https = run("success", httpsDest, [httpsOption, "places.example.com"])
  assert.equal(https.status, 0, https.stdout + https.stderr)
  const httpsEnv = readFileSync(join(httpsDest, ".env"), "utf8")
  assert.match(httpsEnv, /^PUBLIC_URL=https:\/\/places\.example\.com$/m)
  assert.match(httpsEnv, /^PLACARD_DOMAIN=places\.example\.com$/m)
  assert.match(httpsEnv, /^PLACARD_BIND_ADDRESS=127\.0\.0\.1$/m)
  assert.equal(
    readFileSync(join(httpsDest, "docker-compose.override.yml"), "utf8"),
    readFileSync(join(root, "compose.https.yaml"), "utf8"),
  )
  assert.equal(
    readFileSync(join(httpsDest, "Caddyfile"), "utf8"),
    readFileSync(join(root, "Caddyfile"), "utf8"),
  )
  assert.match(https.log, /"-f","docker-compose.yml","-f","docker-compose.override.yml","up"/)
  assert.match(https.stdout, /Certificate issuance may still be pending/)
  const fallbackDest = join(temp, "https fallback")
  const fallback = run("fallback", fallbackDest, [httpsOption, "places.example.com"])
  assert.equal(fallback.status, 0, fallback.stdout + fallback.stderr)
  for (const id of [101, 102, 103, 104]) assert.ok(fallback.log.includes(`/assets/${id}`))
  for (const name of ["example.env", "docker-compose.override.yml", "Caddyfile"]) {
    assert.equal(
      readFileSync(join(fallbackDest, name), "utf8"),
      readFileSync(join(temp, name), "utf8"),
    )
  }
  const downloadDest = join(temp, "https download failure")
  assert.notEqual(run("download", downloadDest, [httpsOption, "places.example.com"]).status, 0)
  assert.equal(existsSync(downloadDest), false)
  console.log(`${shell}: installer checks passed`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}

# Published copies are pinned by prepare-release-assets.mjs.
[CmdletBinding()]
param(
    [string]$Directory = './placard-app',
    [string]$Port = '3000',
    [string]$PublicUrl = '',
    [ValidateSet('local', 'network')][string]$Access = 'local',
    [string]$HttpsDomain = '',
    [switch]$NonInteractive
)
$ErrorActionPreference = 'Stop'
$Release = '@PLACARD_RELEASE@'
$Repository = '@PLACARD_REPOSITORY@'
$Stage = $null
$Installed = $false
function RunDocker {
    & $DockerExecutable @args
    if ($LASTEXITCODE -ne 0) { throw "Docker command failed (exit $LASTEXITCODE). Check Docker Desktop/Engine and daemon permissions." }
}
function PromptValue([string]$Label, [string]$Default) {
    $Value = Read-Host "$Label [$Default]"
    if ([string]::IsNullOrWhiteSpace($Value)) { return $Default }
    return $Value
}
function Secret {
    $Bytes = New-Object byte[] 32
    $Rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $Rng.GetBytes($Bytes) } finally { $Rng.Dispose() }
    return ([BitConverter]::ToString($Bytes)).Replace('-', '').ToLowerInvariant()
}
try {
    if ($Release.StartsWith('@')) { throw 'Download this installer from a GitHub Release.' }
    if (!(Get-Command docker -ErrorAction SilentlyContinue)) { throw 'Install Docker first: https://docs.docker.com/compose/install/' }
    $DockerExecutable = (Get-Command docker -CommandType Application | Select-Object -First 1).Source
    $Info = RunDocker info --format '{{.OSType}}/{{.Architecture}}'
    if ($Info -notmatch '^linux/(amd64|arm64|x86_64|aarch64)$') { throw "Unsupported Docker daemon: $Info. Use AMD64/ARM64 Linux containers." }
    $HelpText = (RunDocker compose up --help) -join "`n"
    if (!$HelpText.Contains('--wait-timeout')) { throw 'Update Docker Compose to support --wait-timeout.' }
    foreach ($Key in @('COMPOSE_FILE','COMPOSE_PROJECT_NAME','COMPOSE_ENV_FILES','PLACARD_IMAGE','POSTGRES_PASSWORD','BETTER_AUTH_SECRET','PUBLIC_URL','PLACARD_PORT','PLACARD_BIND_ADDRESS','PLACARD_DOMAIN')) {
        if ([Environment]::GetEnvironmentVariable($Key)) { throw "Unset $Key before running the installer." }
    }
    $Containers = RunDocker ps -aq --filter label=com.docker.compose.project=placard
    $Volumes = RunDocker volume ls -q --filter label=com.docker.compose.project=placard
    if ($Containers -or $Volumes) { throw 'An existing placard project was found. Use the documented backup and upgrade procedure.' }
    foreach ($Volume in @('placard_pgdata','placard_media','placard_modules','placard_caddy_data','placard_caddy_config')) {
        & $DockerExecutable volume inspect $Volume *> $null
        if ($LASTEXITCODE -eq 0) { throw "Existing volume $Volume found; refusing to reuse data." }
    }
    if (!$NonInteractive) {
        $Directory = PromptValue 'Installation directory' $Directory
        $Port = PromptValue 'Host port' $Port
        $HttpsDomain = PromptValue 'HTTPS domain (blank for HTTP or an existing reverse proxy)' $HttpsDomain
        if (!$HttpsDomain) {
            if (!$PublicUrl) { $PublicUrl = "http://localhost:$Port" }
            $PublicUrl = PromptValue 'Public URL' $PublicUrl
            $Access = PromptValue 'Access (local or network)' $Access
        }
    }
    if ($HttpsDomain) {
        if ($HttpsDomain.Length -gt 253 -or $HttpsDomain -cnotmatch '^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$') { throw 'HTTPS requires a public DNS domain, without scheme, port, or path.' }
        if ($HttpsDomain -match '\.(local|localhost|internal|test|invalid|home\.arpa)$') { throw 'Use a public DNS domain for automatic HTTPS.' }
        if ($PublicUrl -and $PublicUrl -cne "https://$HttpsDomain") { throw 'Public URL must match the HTTPS domain.' }
        $PublicUrl = "https://$HttpsDomain"
        $Access = 'local'
        if ($Port -in @('80','443')) { throw 'HTTPS reserves host ports 80 and 443; choose another app port.' }
    }
    if (!$PublicUrl) { $PublicUrl = "http://localhost:$Port" }
    if ($Port -notmatch '^[1-9][0-9]{0,4}$' -or [int]$Port -gt 65535) { throw 'Port must be between 1 and 65535.' }
    if ($PublicUrl -cnotmatch '^https?://(\[[0-9a-fA-F:]+\]|[a-zA-Z0-9.-]+)(:[1-9][0-9]{0,4})?$') { throw 'Public URL must be an http(s) origin without path, credentials, query, or trailing slash.' }
    if ($PublicUrl -match ':([0-9]+)$' -and [int]$Matches[1] -gt 65535) { throw 'Public URL port must be between 1 and 65535.' }
    if ($Access -notin @('local','network')) { throw 'Access must be local or network.' }
    $BindAddress = if ($Access -eq 'local') { '127.0.0.1' } else { '0.0.0.0' }
    if (!$Directory.Trim()) { throw 'Installation directory cannot be empty.' }
    $Directory = [IO.Path]::GetFullPath($Directory)
    if (Test-Path -LiteralPath $Directory) { throw 'Destination already exists. Choose a new directory; existing installations must be managed manually.' }
    $Stage = Join-Path ([IO.Path]::GetTempPath()) ([Guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $Stage | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    $Base = "https://github.com/$Repository/releases/download/$Release"
    $Assets = @('docker-compose.yml','example.env')
    if ($HttpsDomain) { $Assets += @('docker-compose.override.yml','Caddyfile') }
    foreach ($Asset in $Assets) {
        Invoke-WebRequest -UseBasicParsing -Uri "$Base/$Asset" -OutFile (Join-Path $Stage $Asset)
        if ((Get-Item (Join-Path $Stage $Asset)).Length -eq 0) { throw "Empty release asset: $Asset" }
    }
    New-Item -ItemType Directory -Path $Directory | Out-Null
    # Restrict the directory before writing any secrets; children inherit this ACL.
    if ($env:OS -eq 'Windows_NT') {
        $Acl = New-Object System.Security.AccessControl.DirectorySecurity
        $Sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $Acl.SetOwner($Sid)
        $Acl.SetAccessRuleProtection($true, $false)
        $Rule = New-Object System.Security.AccessControl.FileSystemAccessRule($Sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $Acl.AddAccessRule($Rule)
        Set-Acl -LiteralPath $Directory -AclObject $Acl
    } else {
        & chmod 700 $Directory
        if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict installation directory permissions.' }
    }
    $Lines = Get-Content -LiteralPath (Join-Path $Stage 'example.env') | Where-Object { $_ -notmatch '^(POSTGRES_PASSWORD|BETTER_AUTH_SECRET|PUBLIC_URL|PLACARD_PORT|PLACARD_BIND_ADDRESS|PLACARD_DOMAIN)=' }
    $Lines += @('', "POSTGRES_PASSWORD=$(Secret)", "BETTER_AUTH_SECRET=$(Secret)", "PUBLIC_URL=$PublicUrl", "PLACARD_PORT=$Port", "PLACARD_BIND_ADDRESS=$BindAddress")
    if ($HttpsDomain) { $Lines += "PLACARD_DOMAIN=$HttpsDomain" }
    [IO.File]::WriteAllText((Join-Path $Directory '.env'), (($Lines -join "`n") + "`n"), (New-Object Text.UTF8Encoding $false))
    if ($env:OS -ne 'Windows_NT') { & chmod 600 (Join-Path $Directory '.env'); if ($LASTEXITCODE -ne 0) { throw 'Cannot restrict .env permissions.' } }
    foreach ($Asset in $Assets) { Copy-Item -LiteralPath (Join-Path $Stage $Asset) -Destination $Directory }
    $Installed = $true
    Push-Location $Directory
    try {
        $Compose = @('compose','--project-name','placard','--env-file','.env','-f','docker-compose.yml')
        if ($HttpsDomain) { $Compose += @('-f','docker-compose.override.yml') }
        RunDocker @Compose config --quiet
        RunDocker @Compose pull
        RunDocker @Compose up -d --wait --wait-timeout 180
    } finally { Pop-Location }
    Write-Host "Placard is healthy. Installation: $Directory"
    Write-Host "URL: $PublicUrl"
    if ($HttpsDomain) {
        Write-Host 'Caddy is configured for automatic HTTPS. Point domain DNS to this server and allow inbound TCP ports 80 and 443.'
        Write-Host 'Certificate issuance may still be pending. Check: docker compose logs --tail=100 caddy'
    }
    Write-Host 'Create your administrator account before exposing the instance. External DNS/TLS has not been verified.'
    Write-Host 'From the installation directory: docker compose ps; docker compose logs --tail=100; docker compose stop'
} catch {
    if ($Installed) {
        Write-Host "Installation retained at: $Directory"
        Write-Host 'Run here: docker compose ps; docker compose logs --tail=100'
        Write-Host 'After correcting the problem: docker compose up -d --wait'
    }
    Write-Error $_ -ErrorAction Continue
    exit 1
} finally {
    if ($Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force -ErrorAction SilentlyContinue }
}

<#
MiniNode desktop installer for Windows 10/11 (Linux and macOS: install.sh).
Run it from the unpacked MiniNode folder, in PowerShell. It needs Docker Desktop and nothing else:
Node, the database and everything else run in containers.

  .\infra\desktop\install.ps1 [-Dir $HOME\mininode] [-Domain mininode.localhost] [-Port 8787] [-Scheme http|https] [-HostPort n]
                              [-Lan] [-AdminEmail you@example.org] [-NoAdmin]
                              [-CaFile company-proxy.pem]

Running it again on an existing installation rebuilds, restarts and migrates; it keeps all data
and secrets. (If scripts are blocked: powershell -ExecutionPolicy Bypass -File .\infra\desktop\install.ps1)
#>
[CmdletBinding()]
param(
  [string]$Dir = (Join-Path $HOME 'mininode'),
  [string]$Domain = 'mininode.localhost',
  [int]$Port = 8787,
  [int]$HostPort = 0,
  [ValidateSet('http', 'https')][string]$Scheme = 'http',
  [switch]$Lan,
  [string]$AdminEmail = '',
  [switch]$NoAdmin,
  [string]$CaFile = ''
)
$ErrorActionPreference = 'Stop'
$Source = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$Image = 'mininode-desktop-host:local'

function Fail($message) { Write-Error $message; exit 1 }
function Docker { & docker @args; if ($LASTEXITCODE -ne 0) { Fail "docker $($args -join ' ') failed" } }

if ($Domain -notmatch '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$') { Fail 'The domain must be a plain host name, e.g. mininode.localhost' }
if ($Port -lt 1 -or $Port -gt 65535) { Fail 'The port must be a number from 1 to 65535' }
if (-not (Test-Path (Join-Path $Source 'infra\desktop\Dockerfile'))) { Fail "Run this from an unpacked MiniNode folder ($Source has no infra\desktop)" }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Fail 'Docker is not installed. Install Docker Desktop (https://www.docker.com/products/docker-desktop/), start it, and run this again.'
}
& docker info *> $null
if ($LASTEXITCODE -ne 0) { Fail 'Docker is installed but not running. Start Docker Desktop and run this again.' }
& docker compose version *> $null
if ($LASTEXITCODE -ne 0) { Fail "Docker Compose v2 is missing (the 'docker compose' command)." }

$fresh = -not (Test-Path (Join-Path $Dir '.env'))
$checkPort = if ($HostPort -gt 0) { $HostPort } else { $Port }
if ($fresh -and (Get-NetTCPConnection -LocalPort $checkPort -State Listen -ErrorAction SilentlyContinue)) {
  Fail "Port $checkPort is already in use on this computer; choose another with -Port (or -HostPort)"
}

Write-Host "Installing MiniNode into $Dir"
New-Item -ItemType Directory -Force -Path (Join-Path $Dir 'hosted') | Out-Null

# A copy of the source next to the settings, so the installation does not depend on this folder.
$next = Join-Path $Dir 'source.next'
if (Test-Path $next) { Remove-Item -Recurse -Force $next }
& robocopy $Source $next /E /XD node_modules .git hosted inbox e2e /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Fail 'Copying the MiniNode source failed' }
$target = Join-Path $Dir 'source'
if (Test-Path $target) { Remove-Item -Recurse -Force $target }
Move-Item $next $target
Copy-Item (Join-Path $target 'infra\desktop\compose.yml') (Join-Path $Dir 'compose.yml') -Force
Copy-Item (Join-Path $target 'infra\desktop\mininode-desktop.ps1') (Join-Path $Dir 'mininode-desktop.ps1') -Force
Copy-Item (Join-Path $target 'infra\desktop\mininode-desktop.cmd') (Join-Path $Dir 'mininode-desktop.cmd') -Force

Write-Host 'Building MiniNode (first time: several minutes)...'
$buildArgs = @('build', '-q', '-f', (Join-Path $target 'infra\desktop\Dockerfile'), '-t', $Image)
if ($CaFile) { $buildArgs += @('--secret', "id=ca,src=$CaFile") }
Docker @buildArgs $target | Out-Null

if ($fresh) {
  $initArgs = @('run', '--rm', '-v', "${Dir}:/out", '-w', '/app', $Image, 'node', 'packages/cli/src/bin.ts',
    'desktop', 'init', '--out', '/out', '--domain', $Domain, '--port', "$Port", '--scheme', $Scheme)
  if ($HostPort -gt 0) { $initArgs += @('--host-port', "$HostPort") }
  if ($Lan) { $initArgs += '--lan' }
  Docker @initArgs
  Add-Content -Path (Join-Path $Dir '.env') -Value "MININODE_SOURCE='./source'"
}

$control = Join-Path $Dir 'mininode-desktop.ps1'
& $control start
& $control migrate

if ($fresh -and -not $NoAdmin) {
  if (-not $AdminEmail) { $AdminEmail = Read-Host 'Email address of the first account (it becomes the admin)' }
  & $control admin $AdminEmail
}

Write-Host ''
Write-Host 'MiniNode is installed and running.'
Write-Host "  Open:     $(& $control url)/login"
Write-Host "  Control:  $control  (start, stop, status, logs, add <app>, backup, update)"
Write-Host "  Secrets:  $(Join-Path $Dir '.env')  (private to you; back it up, losing it means losing the data)"
Write-Host 'MiniNode starts again by itself when Docker Desktop starts. Next: docs\runbooks\setup-desktop.md'

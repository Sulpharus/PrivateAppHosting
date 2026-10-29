<#
Controls a MiniNode desktop installation on Windows (Linux/macOS: mininode-desktop).
  mininode-desktop start | stop | restart | status | logs [service] | url | migrate
  mininode-desktop add <app folder | app.zip>   install or update a web app
  mininode-desktop admin <email>                create an account (asks for the password)
  mininode-desktop password <email>             set a new password for an account
  mininode-desktop restore <backup folder>      replace ALL data with a backup (asks first)
  mininode-desktop backup [folder]              database, files and settings into one folder
  mininode-desktop update <new source folder>   switch to a newer MiniNode and restart
  mininode-desktop uninstall                    remove containers (asks before deleting data)
#>
$ErrorActionPreference = 'Stop'
$Here = $PSScriptRoot
Set-Location $Here
$Image = 'mininode-desktop-host:local'

function Fail($message) { Write-Error $message; exit 1 }
function Compose { & docker compose --project-directory $Here @args; if ($LASTEXITCODE -ne 0) { Fail "docker compose $($args -join ' ') failed" } }
function Mn { Compose exec -T -w /app host node packages/cli/src/bin.ts @args }
function EnvValue($name) {
  $line = Get-Content (Join-Path $Here '.env') | Where-Object { $_ -like "$name='*" } | Select-Object -First 1
  if ($line) { $line.Substring($name.Length + 2).TrimEnd("'") }
}
function NeedInstalled { if (-not ((Test-Path (Join-Path $Here '.env')) -and (Test-Path (Join-Path $Here 'compose.yml')))) { Fail 'This folder has no installation (run the installer)' } }

function WaitHealthy {
  Write-Host 'Waiting for MiniNode to start (the first start takes a minute)...'
  for ($i = 0; $i -lt 90; $i++) {
    $state = (& docker compose --project-directory $Here ps --format '{{.Health}}' host 2>$null | Select-Object -First 1)
    if ($state -eq 'healthy') { return }
    Start-Sleep -Seconds 2
  }
  Fail "MiniNode did not become healthy; see: mininode-desktop logs"
}

function ReadPassword {
  if ($env:MININODE_ADMIN_PASSWORD) { return }
  while ($true) {
    $a = Read-Host 'Password (12+ characters)' -AsSecureString
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($a))
    if ($plain.Length -lt 12) { Write-Host 'Too short.'; continue }
    $b = Read-Host 'Repeat' -AsSecureString
    $again = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($b))
    if ($plain -eq $again) { $env:MININODE_ADMIN_PASSWORD = $plain; return }
    Write-Host 'Not the same.'
  }
}

$command = if ($args.Count -gt 0) { $args[0] } else { '' }
$rest = if ($args.Count -gt 1) { $args[1..($args.Count - 1)] } else { @() }

switch ($command) {
  'start' { NeedInstalled; Compose up -d; WaitHealthy; Write-Host "MiniNode is running: $(EnvValue 'PORTAL_PUBLIC_URL')" }
  'stop' { NeedInstalled; Compose stop }
  'restart' { NeedInstalled; Compose restart; WaitHealthy }
  'status' { NeedInstalled; Compose ps }
  'logs' { NeedInstalled; Compose logs --tail 200 -f @rest }
  'url' { EnvValue 'PORTAL_PUBLIC_URL' }
  'migrate' { NeedInstalled; Mn desktop migrate }
  'admin' {
    NeedInstalled
    if ($rest.Count -lt 1) { Fail 'usage: admin <email>' }
    ReadPassword
    Compose exec -T -e MININODE_ADMIN_PASSWORD -w /app host node packages/cli/src/bin.ts desktop admin $rest[0]
  }
  'password' {
    NeedInstalled
    if ($rest.Count -lt 1) { Fail 'usage: password <email>' }
    ReadPassword
    Compose exec -T -e MININODE_ADMIN_PASSWORD -w /app host node packages/cli/src/bin.ts desktop password $rest[0]
  }
  'restore' {
    NeedInstalled
    if ($rest.Count -lt 1 -or -not (Test-Path (Join-Path $rest[0] 'database.dump'))) { Fail 'usage: restore <backup folder with database.dump>' }
    $from = (Resolve-Path $rest[0]).Path
    Write-Host "This REPLACES everything in MiniNode (database, files, apps) with the backup in $from."
    if ((Read-Host 'Type RESTORE to continue') -cne 'RESTORE') { Fail 'Not confirmed; nothing changed' }
    $backupEnv = Join-Path $from 'env.backup'
    $currentEnv = Join-Path $Here '.env'
    if ((Test-Path $backupEnv) -and ((Get-FileHash $backupEnv).Hash -ne (Get-FileHash $currentEnv).Hash)) {
      Write-Host "The backup's secrets differ from this installation's. The data only works with its own secrets."
      $keep = Read-Host "Use the backup's secrets (the current .env is kept as .env.before-restore)? [Y/n]"
      if ($keep -notin 'n', 'N') { Copy-Item $currentEnv (Join-Path $Here '.env.before-restore') -Force; Copy-Item $backupEnv $currentEnv -Force }
    }
    Compose stop host kong auth rest storage
    Compose up -d db
    for ($i = 0; $i -lt 30; $i++) { if ((& docker compose --project-directory $Here ps --format '{{.Health}}' db) -eq 'healthy') { break }; Start-Sleep -Seconds 2 }
    $dbId = (& docker compose --project-directory $Here ps -q db)
    & docker cp (Join-Path $from 'database.dump') "${dbId}:/tmp/restore.dump"
    Compose exec -T db pg_restore -U supabase_admin -d postgres --clean --if-exists /tmp/restore.dump
    $repair = @'
do $$ declare r record; cur bigint; top bigint; begin
  for r in select n.nspname sch, c.relname tbl, a.attname col, pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) seq
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
             join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            where c.relkind = 'r' and n.nspname not in ('pg_catalog', 'information_schema') loop
    continue when r.seq is null;
    execute format('select coalesce(max(%I), 0) from %I.%I', r.col, r.sch, r.tbl) into top;
    execute 'select last_value from ' || r.seq into cur;
    if top > cur then perform setval(r.seq, top, true); end if;
  end loop;
end $$;
'@
    Compose exec -T db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -c $repair
    $tarImage = (& docker inspect --format '{{.Config.Image}}' $dbId)
    foreach ($volume in 'storage-data', 'host-data') {
      if (Test-Path (Join-Path $from "$volume.tar.gz")) {
        & docker run --rm -v "mininode_${volume}:/data" -v "${from}:/in:ro" --entrypoint sh $tarImage -c "find /data -mindepth 1 -delete && tar xzf /in/$volume.tar.gz -C /data"
      }
    }
    Compose up -d
    WaitHealthy
    Write-Host 'Restored. Everyone has to sign in again.'
  }
  'add' {
    NeedInstalled
    if ($rest.Count -lt 1 -or -not (Test-Path $rest[0])) { Fail 'usage: add <app folder | app.zip>' }
    $tmp = Join-Path ([IO.Path]::GetTempPath()) ("mininode-add-" + [guid]::NewGuid())
    New-Item -ItemType Directory -Path $tmp | Out-Null
    try {
      $src = (Resolve-Path $rest[0]).Path
      if ((Get-Item $src).PSIsContainer) { Copy-Item -Recurse $src (Join-Path $tmp 'app') }
      else {
        Expand-Archive -Path $src -DestinationPath (Join-Path $tmp 'app')
        $items = Get-ChildItem (Join-Path $tmp 'app')
        if ($items.Count -eq 1 -and $items[0].PSIsContainer) { Move-Item $items[0].FullName (Join-Path $tmp 'inner'); Remove-Item (Join-Path $tmp 'app'); Move-Item (Join-Path $tmp 'inner') (Join-Path $tmp 'app') }
      }
      $manifest = Join-Path $tmp 'app\mininode.json'
      if (-not (Test-Path $manifest)) { Fail 'No mininode.json in the app: it is not a MiniNode app yet (see docs\runbooks\uploads.md)' }
      $slug = (Get-Content $manifest -Raw | ConvertFrom-Json).slug
      if ($slug -notmatch '^[a-z][a-z0-9-]{0,30}[a-z0-9]$') { Fail 'The manifest has no valid slug' }
      $target = Join-Path $Here "hosted\$slug"
      if (Test-Path $target) { Remove-Item -Recurse -Force $target }
      New-Item -ItemType Directory -Force -Path (Join-Path $Here 'hosted') | Out-Null
      Copy-Item -Recurse (Join-Path $tmp 'app') $target
      if (Test-Path (Join-Path $target 'package.json')) { Compose exec -T host sh -c "cd /app && pnpm install --no-frozen-lockfile --filter ./hosted/$slug..." }
      Mn doctor "hosted/$slug"
      Mn deploy "hosted/$slug" --env desktop
      Write-Host "Installed $slug. Give people access under Verwaltung -> Apps."
    } finally { Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue }
  }
  'backup' {
    NeedInstalled
    $out = if ($rest.Count -gt 0) { $rest[0] } else { Join-Path $Here ("backups\" + (Get-Date -Format 'yyyyMMdd-HHmmss')) }
    New-Item -ItemType Directory -Force -Path $out | Out-Null
    $out = (Resolve-Path $out).Path
    Write-Host "Backing up to $out ..."
    # The dump goes through a file inside the container: PowerShell would mangle binary output on a pipe.
    Compose exec -T db sh -c 'pg_dump -U supabase_admin -Fc postgres -f /tmp/database.dump'
    & docker cp "$((& docker compose --project-directory $Here ps -q db)):/tmp/database.dump" (Join-Path $out 'database.dump')
    $tarImage = (& docker inspect --format '{{.Config.Image}}' (& docker compose --project-directory $Here ps -q db))
    foreach ($volume in 'storage-data', 'host-data') {
      & docker run --rm -v "mininode_${volume}:/data:ro" -v "${out}:/out" --entrypoint tar $tarImage czf "/out/$volume.tar.gz" -C /data .
    }
    Copy-Item (Join-Path $Here '.env') (Join-Path $out 'env.backup')
    Write-Host 'Done. The folder holds your secrets (env.backup): keep it somewhere private.'
  }
  'update' {
    NeedInstalled
    if ($rest.Count -lt 1 -or -not (Test-Path (Join-Path $rest[0] 'infra\desktop\Dockerfile'))) { Fail 'usage: update <folder with the new MiniNode source>' }
    & $PSCommandPath backup
    $source = Join-Path $Here 'source'
    if (Test-Path "$source.old") { Remove-Item -Recurse -Force "$source.old" }
    if (Test-Path $source) { Move-Item $source "$source.old" }
    & robocopy (Resolve-Path $rest[0]).Path $source /E /XD node_modules .git hosted inbox e2e /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { Fail 'Copying the new source failed' }
    Copy-Item (Join-Path $source 'infra\desktop\compose.yml') (Join-Path $Here 'compose.yml') -Force
    Compose build host
    Compose up -d
    WaitHealthy
    Mn desktop migrate
    Copy-Item (Join-Path $source 'infra\desktop\mininode-desktop.ps1') (Join-Path $Here 'mininode-desktop.ps1.new') -Force
    Write-Host 'Updated. Your apps need no redeploy. The new control script is mininode-desktop.ps1.new: replace the old one with it when you like.'
  }
  'uninstall' {
    NeedInstalled
    Write-Host 'This stops MiniNode and removes its containers.'
    $answer = Read-Host 'Also DELETE all data (database, files, apps)? Type DELETE to do that, Enter to keep it'
    if ($answer -ceq 'DELETE') { Compose down --volumes --remove-orphans } else { Compose down --remove-orphans }
    Write-Host "Removed. The folder $Here (settings, backups) is still there; delete it yourself when you are sure."
  }
  default { Get-Content $PSCommandPath -TotalCount 11 | Select-Object -Skip 1 | Write-Host; exit 2 }
}

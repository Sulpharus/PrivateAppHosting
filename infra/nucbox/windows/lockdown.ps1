# Restricts the RemoteApp account: users see only the published program, never a desktop,
# shell, settings or the file system of the VM. Run as Administrator after setup.ps1.
param([string] $RdpUser = 'mininode')
$ErrorActionPreference = 'Stop'

# Load the user's registry hive (create the profile first by signing in once over RDP).
$sid = (Get-LocalUser -Name $RdpUser).SID.Value
$profilePath = (Get-CimInstance Win32_UserProfile | Where-Object SID -eq $sid).LocalPath
if (-not $profilePath) { throw "sign in once as $RdpUser so that its profile exists" }
$mounted = $false
if (-not (Test-Path "Registry::HKEY_USERS\$sid")) {
  reg load "HKU\$sid" "$profilePath\NTUSER.DAT" | Out-Null
  $mounted = $true
}
$hive = "Registry::HKEY_USERS\$sid"

function Set-Policy($path, $name, $value) {
  New-Item "$hive\$path" -Force | Out-Null
  Set-ItemProperty "$hive\$path" -Name $name -Value $value -Type DWord
}

try {
  $explorer = 'Software\Microsoft\Windows\CurrentVersion\Policies\Explorer'
  $system = 'Software\Microsoft\Windows\CurrentVersion\Policies\System'
  Set-Policy $explorer NoDrives 0x3FFFFFF          # hide all drives in dialogs
  Set-Policy $explorer NoViewOnDrive 0x3FFFFFF      # and block browsing them
  Set-Policy $explorer NoRun 1
  Set-Policy $explorer NoControlPanel 1
  Set-Policy $explorer NoWinKeys 1
  Set-Policy $explorer NoClose 1
  Set-Policy $system DisableTaskMgr 1
  Set-Policy $system DisableRegistryTools 1
  Set-Policy 'Software\Policies\Microsoft\Windows\System' DisableCMD 1
  # Block interactive shells and script hosts for this user.
  Set-Policy $explorer DisallowRun 1
  $deny = "$hive\$explorer\DisallowRun"
  New-Item $deny -Force | Out-Null
  $blocked = 'powershell.exe', 'pwsh.exe', 'powershell_ise.exe', 'cmd.exe', 'wscript.exe', 'cscript.exe', 'mshta.exe', 'regedit.exe'
  for ($i = 0; $i -lt $blocked.Count; $i++) { Set-ItemProperty $deny -Name ($i + 1) -Value $blocked[$i] }
} finally {
  [gc]::Collect()
  if ($mounted) { reg unload "HKU\$sid" | Out-Null }
}

# The account may not sign in locally (console) — only over RDP.
$tmp = New-TemporaryFile
secedit /export /cfg $tmp /areas USER_RIGHTS | Out-Null
$cfg = Get-Content $tmp
$line = $cfg | Where-Object { $_ -like 'SeDenyInteractiveLogonRight*' }
$entry = "*$sid"
if (-not $line) { $cfg += "SeDenyInteractiveLogonRight = $entry" }
elseif ($line -notmatch [regex]::Escape($entry)) { $cfg = $cfg -replace [regex]::Escape($line), "$line,$entry" }
$cfg | Set-Content $tmp
secedit /configure /db "$env:TEMP\mininode.sdb" /cfg $tmp /areas USER_RIGHTS | Out-Null
Remove-Item $tmp

Write-Host "locked down $RdpUser"

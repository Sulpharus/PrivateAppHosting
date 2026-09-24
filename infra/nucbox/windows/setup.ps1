# One-time setup of the Windows 11 VM (run as Administrator inside the VM after installing the
# VirtIO drivers and the QEMU guest agent from virtio-win.iso). Idempotent.
#   powershell -ExecutionPolicy Bypass -File setup.ps1 -RdpPassword (Read-Host -AsSecureString)
param(
  [Parameter(Mandatory)] [securestring] $RdpPassword,
  [string] $RdpUser = 'mininode'
)
$ErrorActionPreference = 'Stop'

Write-Host '▸ locale and time zone'
Set-TimeZone -Id 'W. Europe Standard Time'
Set-WinSystemLocale de-DE
Set-WinUserLanguageList de-DE -Force

Write-Host '▸ RDP with NLA, RemoteApp allow-list only'
$ts = 'HKLM:\SYSTEM\CurrentControlSet\Control\Terminal Server'
Set-ItemProperty $ts -Name fDenyTSConnections -Value 0
Set-ItemProperty "$ts\WinStations\RDP-Tcp" -Name UserAuthentication -Value 1
Enable-NetFirewallRule -DisplayGroup 'Remote Desktop'
$allow = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Terminal Server\TSAppAllowList'
New-Item $allow -Force | Out-Null
Set-ItemProperty $allow -Name fDisabledAllowList -Value 0 -Type DWord
New-Item "$allow\Applications" -Force | Out-Null
# RDP only from the Linux VM (guacd); nothing else on the LAN may connect.
Get-NetFirewallRule -DisplayGroup 'Remote Desktop' | Set-NetFirewallRule -RemoteAddress '10.10.0.10'

Write-Host "▸ user $RdpUser"
if (-not (Get-LocalUser -Name $RdpUser -ErrorAction SilentlyContinue)) {
  New-LocalUser -Name $RdpUser -Password $RdpPassword -PasswordNeverExpires -UserMayNotChangePassword -FullName 'MiniNode' | Out-Null
}
Add-LocalGroupMember -Group 'Remote Desktop Users' -Member $RdpUser -ErrorAction SilentlyContinue

Write-Host '▸ power: the host hibernates the VM; the guest itself never sleeps'
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change monitor-timeout-ac 0
powercfg /hibernate off

Write-Host '▸ updates outside usage hours, no forced restarts while a session is open'
$wu = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
New-Item $wu -Force | Out-Null
Set-ItemProperty $wu -Name NoAutoRebootWithLoggedOnUsers -Value 1 -Type DWord
Set-ItemProperty $wu -Name AUOptions -Value 4 -Type DWord
Set-ItemProperty $wu -Name ScheduledInstallTime -Value 4 -Type DWord

Write-Host '▸ sessions: end disconnected sessions after 15 min, idle after 60 min'
$pol = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services'
New-Item $pol -Force | Out-Null
Set-ItemProperty $pol -Name MaxDisconnectionTime -Value 900000 -Type DWord
Set-ItemProperty $pol -Name MaxIdleTime -Value 3600000 -Type DWord
Set-ItemProperty $pol -Name fDisableCdm -Value 1 -Type DWord        # no drive redirection
Set-ItemProperty $pol -Name fDisableCcm -Value 1 -Type DWord        # no COM ports
Set-ItemProperty $pol -Name fDisableLPT -Value 1 -Type DWord
Set-ItemProperty $pol -Name fDisablePNPRedir -Value 1 -Type DWord

Write-Host '▸ guest agent'
if ((Get-Service QEMU-GA -ErrorAction SilentlyContinue).Status -ne 'Running') {
  throw 'QEMU guest agent is not running; install it from virtio-win.iso (guest-agent\qemu-ga-x86_64.msi)'
}

Write-Host 'done. Next: run lockdown.ps1, then take the Proxmox snapshot "base".'

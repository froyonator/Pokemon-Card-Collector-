<#
.SYNOPSIS
  Registers a Windows Scheduled Task that runs run-full-sync.ps1 automatically,
  so the card-database sync no longer needs anyone to start it by hand.

.DESCRIPTION
  Creates (or replaces) a Task Scheduler task named "PokemonCardCollector-DataSync"
  that launches run-full-sync.ps1 in the background on the schedule you choose.
  The task runs whether or not you're logged in interactively (as long as the
  machine is on), and only while on AC power by default is NOT enforced here --
  a full sync can take hours, so battery-only laptops should pass
  -RequireACPower to avoid draining the battery unattended.

  This script only registers the schedule. It does not run a sync itself --
  run run-full-sync.ps1 directly first to confirm it works before scheduling it.

.PARAMETER TriggerType
  'Daily', 'Weekly', or 'AtLogon'. Default: Weekly.

.PARAMETER At
  Time of day to start (24h "HH:mm"), used by Daily/Weekly. Default: '03:00'
  (run overnight).

.PARAMETER DayOfWeek
  Which day for the Weekly trigger. Default: Sunday.

.PARAMETER RequireACPower
  If set, the task won't start (or will stop) on battery power. Off by
  default since most data-pipeline machines are desktops; pass this on a
  laptop.

.PARAMETER Sources
  Passed straight through to run-full-sync.ps1's -Sources parameter.

.EXAMPLE
  .\register-scheduled-task.ps1
  Registers a weekly Sunday 3am full sync of every source/language.

.EXAMPLE
  .\register-scheduled-task.ps1 -TriggerType Daily -At '02:00' -Sources english-fallback,japanese-fallback
  Registers a daily 2am run that only re-syncs the two fallback sources.

.NOTES
  Run this from an elevated ("Run as Administrator") PowerShell prompt --
  registering a scheduled task under Task Scheduler's default settings
  requires it. To remove the task later:
    Unregister-ScheduledTask -TaskName 'PokemonCardCollector-DataSync' -Confirm:$false
#>
[CmdletBinding()]
param(
    [ValidateSet('Daily', 'Weekly', 'AtLogon')]
    [string]$TriggerType = 'Weekly',
    [string]$At = '03:00',
    [System.DayOfWeek]$DayOfWeek = [System.DayOfWeek]::Sunday,
    [switch]$RequireACPower,
    [string[]]$Sources = @('primary', 'english-fallback', 'japanese-fallback')
)

$ErrorActionPreference = 'Stop'
$taskName = 'PokemonCardCollector-DataSync'
$scriptPath = Join-Path $PSScriptRoot 'run-full-sync.ps1'

if (-not (Test-Path $scriptPath)) {
    throw "run-full-sync.ps1 not found at $scriptPath -- make sure this script stays alongside it."
}

$sourceArgs = ($Sources -join ',')
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -Sources $sourceArgs" `
    -WorkingDirectory $PSScriptRoot

switch ($TriggerType) {
    'Daily'   { $trigger = New-ScheduledTaskTrigger -Daily -At $At }
    'Weekly'  { $trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $DayOfWeek -At $At }
    'AtLogon' { $trigger = New-ScheduledTaskTrigger -AtLogOn }
}

# StartWhenAvailable: if the machine was asleep/off at the scheduled time,
# run as soon as it's next available instead of silently skipping that cycle.
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Hours 12) `
    -AllowStartIfOnBatteries:(-not $RequireACPower) `
    -DontStopIfGoingOnBatteries:(-not $RequireACPower)

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited

# Register-ScheduledTask's CIM-backed error doesn't reliably respect the
# script-level $ErrorActionPreference = 'Stop' set above (confirmed: it
# printed "Access is denied" as a non-terminating error and execution
# continued past it) -- pass -ErrorAction Stop directly on this call, and
# gate every success message behind an explicit try/catch, so a failed
# registration can never print a false "Registered scheduled task" message.
try {
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
        -Settings $settings -Principal $principal -Description `
        'Runs the Pokemon Card Collector data pipeline sync (run-full-sync.ps1): primary source/English fallback/Japanese fallback snapshots, no AI involvement.' `
        -Force -ErrorAction Stop | Out-Null
}
catch {
    Write-Error "Failed to register the scheduled task: $($_.Exception.Message)"
    Write-Host "This usually means the current PowerShell session isn't elevated. Re-run this script from an elevated (Run as Administrator) PowerShell prompt."
    exit 1
}

Write-Host "Registered scheduled task '$taskName' ($TriggerType, sources: $sourceArgs)."
Write-Host "Run it once manually to confirm before waiting for the schedule: Start-ScheduledTask -TaskName '$taskName'"
Write-Host "View its history/status in Task Scheduler (taskschd.msc), or check for the newest log under data\run-logs\ after it fires."
Write-Host "Remove it later with: Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"

<#
.SYNOPSIS
  Runs every card-database snapshot source (TCGdex, PkmnCards, Art of Pokémon)
  end to end, with retries and logging, and no AI/agent involvement.

.DESCRIPTION
  This is the automatic, "no AI tokens" version of the manual PowerShell
  background jobs used earlier -- a single script a person (or Task
  Scheduler, see register-scheduled-task.ps1) can start and walk away from.

  Each source is independent (different site, own rate limit) and runs as
  its own detached process in parallel. A source that fails (transient
  network error, one bad page, etc.) is retried up to -MaxRetries times,
  waiting -RetryDelaySeconds between attempts, since none of the three
  underlying snapshot scripts support resuming mid-run -- a failure always
  restarts that source's crawl from scratch.

  Every attempt's stdout/stderr is captured to its own timestamped log file
  under data\run-logs\, and a single JSON summary is written at the end
  listing what succeeded, what failed, and where to find the detail --
  that summary is what a later AI review session should read first instead
  of re-reading every raw log.

  Deliberately does NOT use Start-Job for parallelism (an earlier version
  did). Start-Job workers run with no console of their own, and nesting a
  further Start-Process call inside one -- even with -WindowStyle Hidden --
  was confirmed live to leave every job stuck at ~0.1s CPU time indefinitely,
  never reaching its first network call. Launching each source directly from
  this top-level script as its own detached Start-Process, then polling for
  completion instead of blocking on -Wait, was verified live to work
  reliably (real card output within seconds, for all 17 default sources).

.PARAMETER Languages
  Which TCGdex languages to snapshot. Defaults to all 15 the app supports.

.PARAMETER Sources
  Which sources to run: any of 'tcgdex', 'pkmncards', 'artofpkm'. Defaults
  to all three.

.PARAMETER MaxRetries
  Attempts per source before giving up on it (default 3).

.PARAMETER RetryDelaySeconds
  Wait between retries of the same source (default 120).

.EXAMPLE
  .\run-full-sync.ps1
  Runs everything: TCGdex for all 15 languages, PkmnCards (all English sets),
  Art of Pokémon (all Japanese sets).

.EXAMPLE
  .\run-full-sync.ps1 -Sources pkmncards,artofpkm
  Skips TCGdex entirely, e.g. to re-run just the two sources most recently
  touched.

.EXAMPLE
  .\run-full-sync.ps1 -Languages en,ja -Sources tcgdex
  Only TCGdex, only English and Japanese.
#>
[CmdletBinding()]
param(
    [string[]]$Languages = @('en', 'ja', 'fr', 'de', 'es', 'it', 'pt', 'nl', 'pl', 'ru', 'ko', 'zh-tw', 'zh-cn', 'id', 'th'),
    [ValidateSet('tcgdex', 'pkmncards', 'artofpkm')]
    [string[]]$Sources = @('tcgdex', 'pkmncards', 'artofpkm'),
    [int]$MaxRetries = 3,
    [int]$RetryDelaySeconds = 120,
    [int]$PollIntervalSeconds = 5
)

$ErrorActionPreference = 'Stop'
$scraperDir = $PSScriptRoot
Set-Location $scraperDir

$logDir = Join-Path $scraperDir 'data\run-logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$runStamp = Get-Date -Format 'yyyy-MM-ddTHH-mm-ss'
$summaryPath = Join-Path $logDir "sync-summary-$runStamp.json"

# A prior run that crashed mid-crawl (killed process, machine sleep, etc.)
# can leave a .{snapshotId}.staging directory behind -- each snapshot script
# already refuses to reuse an existing staging dir (mkdir with
# recursive: false), so a stale one would make every future attempt for
# that exact same source+timestamp fail immediately. Timestamps are
# per-second so this is very unlikely to collide in practice, but clearing
# leftover staging dirs from a genuinely abandoned run is a reasonable,
# safe cleanup step before starting a fresh sync.
Get-ChildItem -Path (Join-Path $scraperDir 'data') -Directory -Filter '.*.staging*' -ErrorAction SilentlyContinue |
    ForEach-Object {
        Write-Host "Removing stale staging directory from a previous run: $($_.FullName)"
        Remove-Item -Path $_.FullName -Recurse -Force
    }

function New-SourceState {
    param([string]$Name, [string]$NpmScript, [string[]]$ExtraArgs)
    [PSCustomObject]@{
        Name      = $Name
        NpmScript = $NpmScript
        ExtraArgs = $ExtraArgs
        Attempt   = 0
        Succeeded = $false
        Done      = $false
        Proc      = $null
        TmpOut    = $null
        TmpErr    = $null
        RetryAt   = $null
        OutLog    = (Join-Path $logDir "$Name-$runStamp.out.log")
        ErrLog    = (Join-Path $logDir "$Name-$runStamp.err.log")
    }
}

function Start-SourceAttempt {
    param($State)
    $State.Attempt++
    "=== Attempt $($State.Attempt) of $MaxRetries -- $(Get-Date -Format o) ===" | Add-Content -Path $State.OutLog
    $State.TmpOut = "$($State.OutLog).attempt$($State.Attempt).tmp"
    $State.TmpErr = "$($State.ErrLog).attempt$($State.Attempt).tmp"
    $argList = @('run', $State.NpmScript)
    if ($State.ExtraArgs -and $State.ExtraArgs.Count -gt 0) {
        $argList += '--'
        $argList += $State.ExtraArgs
    }
    # npm.cmd directly, not cmd.exe /c npm -- one fewer process layer, and
    # confirmed live to start reliably under -WindowStyle Hidden.
    $State.Proc = Start-Process -FilePath 'npm.cmd' -ArgumentList $argList `
        -WorkingDirectory $scraperDir -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput $State.TmpOut -RedirectStandardError $State.TmpErr
    $State.RetryAt = $null
}

function Complete-SourceAttempt {
    param($State)
    Get-Content $State.TmpOut -ErrorAction SilentlyContinue | Add-Content -Path $State.OutLog
    Get-Content $State.TmpErr -ErrorAction SilentlyContinue | Add-Content -Path $State.ErrLog
    Remove-Item $State.TmpOut, $State.TmpErr -ErrorAction SilentlyContinue

    if ($State.Proc.ExitCode -eq 0) {
        $State.Succeeded = $true
        $State.Done = $true
    }
    elseif ($State.Attempt -ge $MaxRetries) {
        $State.Done = $true
    }
    else {
        Write-Host "[$($State.Name)] attempt $($State.Attempt) failed (exit $($State.Proc.ExitCode)); retrying in ${RetryDelaySeconds}s..."
        $State.Proc = $null
        $State.RetryAt = (Get-Date).AddSeconds($RetryDelaySeconds)
    }
}

# Each source targets a different site with its own independent rate limit,
# so running them concurrently (not sequentially) is both safe and
# meaningfully faster for a "kick off overnight" use case.
$sources = @()

if ($Sources -contains 'tcgdex') {
    foreach ($lang in $Languages) {
        $sources += New-SourceState -Name "tcgdex-$lang" -NpmScript 'snapshot-tcgdex' -ExtraArgs @($lang)
    }
}
if ($Sources -contains 'pkmncards') {
    $sources += New-SourceState -Name 'pkmncards-en' -NpmScript 'snapshot-pkmncards' -ExtraArgs @()
}
if ($Sources -contains 'artofpkm') {
    $sources += New-SourceState -Name 'artofpkm-ja' -NpmScript 'snapshot-artofpkm' -ExtraArgs @()
}

foreach ($s in $sources) { Start-SourceAttempt -State $s }

Write-Host "Started $($sources.Count) snapshot source(s). Waiting for all to finish -- this can take hours for a full multi-language/full-catalog run."
Write-Host "Tail any source's progress with: Get-Content '$logDir\<source-name>-$runStamp.out.log' -Wait"

while ($sources | Where-Object { -not $_.Done }) {
    Start-Sleep -Seconds $PollIntervalSeconds
    foreach ($s in $sources) {
        if ($s.Done) { continue }
        if ($s.Proc) {
            if ($s.Proc.HasExited) { Complete-SourceAttempt -State $s }
        }
        elseif ($s.RetryAt -and (Get-Date) -ge $s.RetryAt) {
            Start-SourceAttempt -State $s
        }
    }
}

$results = $sources | ForEach-Object {
    [PSCustomObject]@{
        job       = $_.Name
        succeeded = $_.Succeeded
        attempts  = $_.Attempt
        outLog    = $_.OutLog
        errLog    = $_.ErrLog
    }
}

$results | ConvertTo-Json -Depth 3 | Out-File -FilePath $summaryPath -Encoding utf8
$failed = $results | Where-Object { -not $_.succeeded }

Write-Host ''
Write-Host "Sync finished. Summary: $summaryPath"
foreach ($r in $results) {
    $status = if ($r.succeeded) { 'OK' } else { 'FAILED' }
    Write-Host "  [$status] $($r.job) ($($r.attempts) attempt(s)) -- $($r.outLog)"
}

if ($failed) {
    Write-Host ''
    Write-Host "$($failed.Count) source(s) failed after $MaxRetries attempts each. Leave their logs in place for a later AI-assisted review pass -- do not re-run automatically beyond what this script already retried."
    exit 1
}
exit 0

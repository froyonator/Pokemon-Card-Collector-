<#
.SYNOPSIS
  Runs every card-database snapshot source (TCGdex, PkmnCards, Art of Pokémon)
  end to end, with retries and logging, and no AI/agent involvement.

.DESCRIPTION
  This is the automatic, "no AI tokens" version of the manual PowerShell
  background jobs used earlier -- a single script a person (or Task
  Scheduler, see register-scheduled-task.ps1) can start and walk away from.

  Each source is independent (different site, own rate limit) and runs as
  its own PowerShell job in parallel. A source that fails (transient network
  error, one bad page, etc.) is retried up to -MaxRetries times, waiting
  -RetryDelaySeconds between attempts, since none of the three underlying
  snapshot scripts support resuming mid-run -- a failure always restarts
  that source's crawl from scratch (this is a real inefficiency in the
  current scripts, deliberately not fixed here; see README.md's "Known
  limitations" section for why that's left for a later AI-assisted pass).

  Every attempt's stdout/stderr is captured to its own timestamped log file
  under data\run-logs\, and a single JSON summary is written at the end
  listing what succeeded, what failed, and where to find the detail --
  that summary is what a later AI review session should read first instead
  of re-reading every raw log.

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
    [int]$RetryDelaySeconds = 120
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
Get-ChildItem -Path (Join-Path $scraperDir 'data') -Directory -Filter '.*.staging' -ErrorAction SilentlyContinue |
    ForEach-Object {
        Write-Host "Removing stale staging directory from a previous run: $($_.FullName)"
        Remove-Item -Path $_.FullName -Recurse -Force
    }

# Deliberately takes every piece of context as an explicit parameter (not a
# closure over the outer script's variables): Start-Job runs its scriptblock
# in a brand-new PowerShell process with its own isolated variable scope, so
# $logDir/$runStamp/$MaxRetries/$RetryDelaySeconds/$scraperDir from the outer
# script would all be $null inside the job if this relied on them being in
# scope -- only what's explicitly passed via -ArgumentList actually arrives.
function Invoke-SnapshotSource {
    param(
        [Parameter(Mandatory)] [string]$JobName,
        [Parameter(Mandatory)] [string]$NpmScript,
        [string[]]$ExtraArgs,
        [Parameter(Mandatory)] [string]$ScraperDir,
        [Parameter(Mandatory)] [string]$LogDir,
        [Parameter(Mandatory)] [string]$RunStamp,
        [Parameter(Mandatory)] [int]$MaxRetries,
        [Parameter(Mandatory)] [int]$RetryDelaySeconds
    )

    $outLog = Join-Path $LogDir "$JobName-$RunStamp.out.log"
    $errLog = Join-Path $LogDir "$JobName-$RunStamp.err.log"
    $attempt = 0
    $succeeded = $false

    while (-not $succeeded -and $attempt -lt $MaxRetries) {
        $attempt++
        "=== Attempt $attempt of $MaxRetries -- $(Get-Date -Format o) ===" | Add-Content -Path $outLog
        $argString = "run $NpmScript --"
        if ($ExtraArgs -and $ExtraArgs.Count -gt 0) { $argString += ' ' + ($ExtraArgs -join ' ') }

        $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList "/c npm $argString" `
            -WorkingDirectory $ScraperDir -NoNewWindow -PassThru -Wait `
            -RedirectStandardOutput "$outLog.tmp" -RedirectStandardError "$errLog.tmp"

        Get-Content "$outLog.tmp" -ErrorAction SilentlyContinue | Add-Content -Path $outLog
        Get-Content "$errLog.tmp" -ErrorAction SilentlyContinue | Add-Content -Path $errLog
        Remove-Item "$outLog.tmp", "$errLog.tmp" -ErrorAction SilentlyContinue

        if ($proc.ExitCode -eq 0) {
            $succeeded = $true
        }
        elseif ($attempt -lt $MaxRetries) {
            Write-Host "[$JobName] attempt $attempt failed (exit $($proc.ExitCode)); retrying in ${RetryDelaySeconds}s..."
            Start-Sleep -Seconds $RetryDelaySeconds
        }
    }

    return [PSCustomObject]@{
        job       = $JobName
        succeeded = $succeeded
        attempts  = $attempt
        outLog    = $outLog
        errLog    = $errLog
    }
}

# Each source targets a different site with its own independent rate limit,
# so running them as separate background jobs (not sequentially) is both
# safe and meaningfully faster for a "kick off overnight" use case.
$jobs = @()

if ($Sources -contains 'tcgdex') {
    foreach ($lang in $Languages) {
        $jobs += Start-Job -Name "tcgdex-$lang" -ScriptBlock ${function:Invoke-SnapshotSource} `
            -ArgumentList "tcgdex-$lang", 'snapshot-tcgdex', @($lang), $scraperDir, $logDir, $runStamp, $MaxRetries, $RetryDelaySeconds
    }
}
if ($Sources -contains 'pkmncards') {
    $jobs += Start-Job -Name 'pkmncards-en' -ScriptBlock ${function:Invoke-SnapshotSource} `
        -ArgumentList 'pkmncards-en', 'snapshot-pkmncards', @(), $scraperDir, $logDir, $runStamp, $MaxRetries, $RetryDelaySeconds
}
if ($Sources -contains 'artofpkm') {
    $jobs += Start-Job -Name 'artofpkm-ja' -ScriptBlock ${function:Invoke-SnapshotSource} `
        -ArgumentList 'artofpkm-ja', 'snapshot-artofpkm', @(), $scraperDir, $logDir, $runStamp, $MaxRetries, $RetryDelaySeconds
}

Write-Host "Started $($jobs.Count) snapshot job(s). Waiting for all to finish -- this can take hours for a full multi-language/full-catalog run."
Write-Host "Tail any job's progress with: Get-Content '$logDir\<job-name>-$runStamp.out.log' -Wait"

Wait-Job -Job $jobs | Out-Null
$results = $jobs | ForEach-Object { Receive-Job -Job $_ }
$jobs | Remove-Job

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

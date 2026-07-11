# Card database scraper

## Running everything automatically, without an AI agent

`run-full-sync.ps1` runs all three snapshot sources below (TCGdex, PkmnCards,
Art of Pokémon) as parallel background jobs, retries a source that fails
(up to 3 times by default, since none of these scripts can resume mid-crawl --
a failure always restarts that source from scratch), logs everything under
`data\run-logs\`, and writes one JSON summary per run. It needs nothing but
plain PowerShell -- no AI/agent session has to be running or watching it.

```powershell
cd "scripts\scraper"
.\run-full-sync.ps1
```

Narrow it down with `-Sources` and/or `-Languages`:

```powershell
.\run-full-sync.ps1 -Sources pkmncards,artofpkm
.\run-full-sync.ps1 -Sources tcgdex -Languages en,ja
```

A full run across every language/source can take hours. Tail a job's live
progress in another window:

```powershell
Get-Content "data\run-logs\pkmncards-en-<timestamp>.out.log" -Wait
```

**Reviewing a completed run:** read the `sync-summary-<timestamp>.json` file
first (one line per source: succeeded/failed, attempt count, log paths) --
that's a quicker starting point than scanning every raw `.out.log`. Any
`.err.log` with content, or a source marked `succeeded: false` after using up
its retries, is what an AI-assisted review pass should look at, along with
checking each successful run's `manifest.json` (`cardCount`, `missingImageCount`)
for numbers that look implausible for that source.

### Running it on a schedule (Task Scheduler)

`register-scheduled-task.ps1` registers a Windows Scheduled Task that calls
`run-full-sync.ps1` automatically, so a sync no longer needs to be started by
hand. Run `run-full-sync.ps1` manually at least once first to confirm it
works before scheduling it. From an elevated ("Run as Administrator")
PowerShell prompt:

```powershell
cd "scripts\scraper"
.\register-scheduled-task.ps1                                    # weekly, Sunday 3am, all sources
.\register-scheduled-task.ps1 -TriggerType Daily -At '02:00'      # daily instead
.\register-scheduled-task.ps1 -Sources pkmncards,artofpkm         # only re-sync these two
```

Check on it via Task Scheduler's GUI (`taskschd.msc`, look for
`PokemonCardCollector-DataSync`), run it on demand with
`Start-ScheduledTask -TaskName 'PokemonCardCollector-DataSync'`, or remove it
with `Unregister-ScheduledTask -TaskName 'PokemonCardCollector-DataSync' -Confirm:$false`.

### Known limitations (left for a later AI-assisted pass, not fixed here)

- **No mid-crawl resume.** A single bad page anywhere in a source's catalog
  discards that entire run (by design -- an immutable snapshot is only
  published once every card in it succeeded) and `run-full-sync.ps1`'s retry
  just restarts the whole source from scratch. For a source with hundreds of
  sets this can mean re-fetching everything after one flaky page near the end.
  A checkpoint/resume mechanism would help but isn't implemented.
- **`Invalid Art of Pokémon detail page` errors** have shown up on at least
  one set page during testing -- likely a page-structure edge case
  `parseArtOfPkm.ts` doesn't handle yet. Worth triaging from the `.err.log`
  of a failed `artofpkm-ja` run.
- **The TCG Collector source below is not included in this automatic sync**
  (see its own section) -- it sits behind a Cloudflare Turnstile challenge
  that requires a human to clear it once and export a session; it can't run
  unattended.

## Recommended bulk source: TCGdex

TCGdex publishes a multilingual database under the MIT license and exposes the
same card metadata and paired asset identifiers through its documented API.
This is the default bulk-ingestion path because it does not depend on bypassing
an access-control challenge.

Build an immutable snapshot for one set:

```sh
npm run snapshot-tcgdex -- en --set sv03.5
```

Omit `--set` to snapshot every set available for a language. All 15 languages
supported by the app are accepted. Each card is fetched with its detailed
metadata, its own TCGdex image URL is downloaded and hashed, and the completed
run is published under `data/tcgdex-<timestamp>/`. A root `manifest.json` is
written last as the completion marker; failed runs are removed.

When TCGdex has metadata but no scan, the record is retained with
`imageStatus: "unavailable-at-source"` and no image hash. The snapshot manifest
lists these card IDs explicitly so the app can use its existing live/user-image
fallback without inventing an image-to-metadata pairing.

Use `--delay-ms <ms>` to change the default 200 ms delay between API or image
requests. Transient HTTP failures are retried three times.

## English source: PkmnCards

PkmnCards exposes English set and card pages containing each card's scan and
structured gameplay metadata together. Build one set with:

```sh
npm run snapshot-pkmncards -- --set pokemon-futsal-promos-2020
```

Omit `--set` to process its full set catalog. The crawler uses ordinary HTTP,
honors a minimum 250 ms delay (750 ms by default), retries transient failures,
and never uses search-query URLs disallowed by the site's robots file.

## Japanese image source: The Art of Pokémon

The Art of Pokémon provides Japanese set/card identities, Japanese and English
names, set numbers, illustrator and Pokédex links, and the scan from the same
card page:

```sh
npm run snapshot-artofpkm -- --set 594
```

Omit `--set` to process every set listed by its `/cards` catalog. These records
remain source-native; they are not guessed or silently joined to an English
record.

## Optional TCG Collector enrichment

Install dependencies and Chromium once:

```sh
npm install
npx playwright install chromium
```

Run a set scrape:

```sh
npm run scrape-set -- id 11921 shadowy-threats id
```

Successful runs are published only after every card succeeds, under an
immutable timestamped path: `data/<snapshot>/<language>/<setId>/`. Failed runs
are removed from staging and exit non-zero, so an incomplete set cannot be
mistaken for a finished snapshot.

Enumerate the sets currently exposed for one region:

```sh
npm run enumerate-sets -- id --storage-state C:\path\to\storage-state.json
```

This prints a JSON set manifest to standard output. The same storage-state
option and environment variable described below apply to both commands.

## Reusing a human-cleared browser session

The scraper can initialize its Playwright browser context from a standard
[Playwright storage-state](https://playwright.dev/docs/auth#reuse-signed-in-state)
JSON file. The challenge or sign-in must be completed manually outside the
scraper; the scraper does not solve challenges or disguise browser automation.

Supply the exported state with a command-line option:

```sh
npm run scrape-set -- id 11921 shadowy-threats id --storage-state C:\path\to\storage-state.json
```

Or set `SCRAPER_STORAGE_STATE` before running the normal command:

```powershell
$env:SCRAPER_STORAGE_STATE = 'C:\path\to\storage-state.json'
npm run scrape-set -- id 11921 shadowy-threats id
```

The command-line option takes precedence over the environment variable. The
file is validated before a browser context is created, and that context is
shared for the entire scrape so updated cookies persist between page loads.

Storage-state files contain authentication cookies. Keep them private, do not
commit them, and delete them when they are no longer needed. The local `.auth/`
directory and `storage-state*.json` are ignored by Git for this reason.

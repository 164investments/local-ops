# Local Ops

Local browser-based ops tools for 164 Investments.

## Life Time Beaverton

The Life Time tab estimates relative gym busyness and recommends the quietest
upcoming hours. It combines:

- a transparent weekday/weekend demand baseline;
- pressure from Life Time Beaverton's official public class schedule, including
  waitlisted classes; and
- optional one-tap observations recorded while at the club.

The result is a relative estimate, not a live member count. Schedule data is
cached locally for resilience, and personal observations stay on the computer
in `~/.local-ops/lifetime-beaverton-observations.json`.

## Install On A Mac

Run this command in Terminal:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/164investments/local-ops/main/setup.sh)"
```

The installer creates:

- `~/local-ops`
- `~/scripts/tsheets-check`
- `~/Applications/Local Ops.app`
- `~/Applications/Update Local Ops.command`

## Update

Run the install command again, or double-click `Update Local Ops.command` in `~/Applications`.

## QuickBooks Time

The first run opens a browser so the user can log in to QuickBooks Time. The saved browser session is stored locally and is ignored by git.

The installer prompts for email report credentials if `~/scripts/tsheets-check/.env` is missing or incomplete. Email reports require:

```bash
RESEND_API_KEY=
RESEND_FROM_EMAIL=Local Ops <reports@stayportland.com>
NOTIFY_EMAIL=trevor@stayportland.com
WAREHOUSE_LAT=45.5205172
WAREHOUSE_LNG=-122.6552987
MAX_DISTANCE_FT=500
```

# Local Ops

Local browser-based ops tools for 164 Investments.

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

Email reports require `~/scripts/tsheets-check/.env` with:

```bash
GMAIL_USER=
GMAIL_APP_PASSWORD=
NOTIFY_EMAIL=trevor@stayportland.com
WAREHOUSE_LAT=45.5205172
WAREHOUSE_LNG=-122.6552987
MAX_DISTANCE_FT=500
```

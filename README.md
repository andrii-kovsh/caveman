# Codex Live Status Dashboard

Local Windows dashboard for tracking Codex workspace activity, QA evidence, artifacts, command logs, and low-resource session status.

## What It Does

- Serves a local dashboard on `http://127.0.0.1:8765`.
- Tracks workspace files, recent changes, artifacts, and commands run through the dashboard.
- Reads Codex `codex.rate_limits` websocket events from the local Codex logs database and shows 5-hour / weekly usage.
- Exposes a cached resource snapshot for `Codex`, `msedgewebview2`, `node`, and `node_repl` with RAM, approximate CPU delta, and GPU counters.
- Stores dashboard runtime metadata under `G:\Stuff\musor\codex-live-status-dashboard` by default.
- Generates a compact QA status footer for Codex conversations.
- Runs as a hidden Windows Scheduled Task at logon.
- Keeps resource use low with cached scans and a file scan limit.

## Main Files

- `status-server.js` - local Node HTTP server.
- `codex-live-dashboard.html` - live dashboard UI.
- `start-codex-status-server.vbs` - hidden server launcher.
- `start-codex-live-dashboard.vbs` - starts server and opens dashboard.
- `open-codex-dashboard-low-gpu.vbs` - opens dashboard as a browser app window.
- `install-codex-dashboard-autostart.ps1` - installs hidden Windows autostart task.
- `check-codex-dashboard-autostart.ps1` - checks task and API health.
- `uninstall-codex-dashboard-autostart.ps1` - removes autostart task.

## Install Autostart

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\install-codex-dashboard-autostart.ps1
```

## Check Status

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\check-codex-dashboard-autostart.ps1
```

## Remove Autostart

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\uninstall-codex-dashboard-autostart.ps1
```

## Notes

The dashboard reads Codex Desktop rate-limit events from `C:\Users\koban\.codex\logs_2.sqlite` when available. It does not infer billing values.
Dashboard runtime state/logs/artifacts are intentionally kept out of the repo and default to `G:\Stuff\musor\codex-live-status-dashboard`.
Resource snapshots are cached separately from file scans; the UI also pauses background refresh while the tab is hidden.

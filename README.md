# Codex Live Status Dashboard

Local Windows dashboard for tracking Codex workspace activity, QA evidence, artifacts, command logs, and low-resource session status.

## What It Does

- Serves a local dashboard on `http://127.0.0.1:8765`.
- Tracks workspace files, recent changes, artifacts, and commands run through the dashboard.
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

The dashboard does not infer exact OpenAI or Codex billing, quota, or rate-limit values. Exact quota data should come from official APIs, response headers, or product UI.

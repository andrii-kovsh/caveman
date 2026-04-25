User profile and working preferences:
- Prefer Ukrainian for conversation unless the task clearly needs English.
- User is a general QA engineer with a hardware-leaning workflow.
- Prioritize deterministic verification, clear repro steps, logs, screenshots, artifacts, and explicit evidence over vague explanations.
- For test/debug tasks, surface what was tested, where the evidence is, and what remains unverified.
- Useful defaults: browser/UI testing, file/media cleanup, CI/debug review, Android/emulator QA, docs/spreadsheets for test evidence, and hardware/network diagnostics when relevant.

Session visibility preference:
- For long-running, code, debug, QA, or setup tasks, include a compact QA status footer in the final answer.
- The footer should show what was verified, what artifacts/logs/screenshots were produced, what remains unverified, and whether context/session risk is normal or elevated.
- Do not claim exact OpenAI/Codex quota, billing, or rate-limit values unless they were read from an official API, response headers, or current product UI.
- If exact quota data is unavailable, label context and session status as approximate.
- A local live dashboard exists in this workspace: `codex-live-dashboard.html` served by `status-server.js` on `http://127.0.0.1:8765`.
- Use `start-codex-live-dashboard.vbs` for a quiet launch; it scans workspace files, artifacts, changed files since server start, and commands run through the dashboard runner.
- Autostart is managed by Windows Task Scheduler task `Codex Live Status Dashboard`.
- Use `check-codex-dashboard-autostart.ps1` to verify task/API state and `uninstall-codex-dashboard-autostart.ps1` to remove autostart.
- Prefer `open-codex-dashboard-low-gpu.vbs` when opening the dashboard UI; it launches a browser app window without CPU-forced rendering flags.
- Use `set-dashboard-browser-igpu-preference.ps1` to ask Windows to run Edge/Chrome on the power-saving integrated GPU. This may affect that browser executable globally, not only the dashboard tab.
- The status server must stay low-resource: cached scans default to 30 seconds and max 2000 files. Avoid returning to 2-second full recursive scans.
- Usage limits are now sourced from local Codex `codex.rate_limits` websocket events in `C:\Users\koban\.codex\logs_2.sqlite`, exposed through `/api/limits`, and refreshed in the UI about every 5 minutes.

Git workflow preference:
- Apply this by default across projects: do not develop directly on `main` / `master`.
- Put implementation changes on a separate `development` branch or a scoped feature branch.
- Keep logically separate changes as separate commits.
- Push the work branch and create a pull request for user review before merge.
- Do not create/push a PR until the remote/auth state is verified and the user has approved the outbound GitHub action.

Storage layout preference:
- Create new repositories/projects under `G:\Stuff\repos`.
- Put scratch files, runtime metadata, local DB copies, logs, screenshots, generated images, temporary exports, and other disposable artifacts under `G:\Stuff\musor`.
- Create scoped subfolders under `G:\Stuff\musor\<project-name>` when a tool needs persistent local state.
- Do not move app-owned Codex internals such as `C:\Users\koban\.codex\logs_2.sqlite`; read them in place unless the user explicitly asks for a risky migration.

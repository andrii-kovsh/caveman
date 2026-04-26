# Codex Live Status Dashboard

Локальний dashboard на `http://127.0.0.1:8765/` для швидкого QA/status огляду.

## Що є

- `Core` режим (за замовчуванням):
  - server health,
  - ключові лічильники: `Changed`, `Artifacts`, `Commands`,
  - usage summary (`5h left`, `weekly left`),
  - списки змінених файлів та артефактів.
- `Advanced` режим:
  - usage details/fallback,
  - resource snapshot,
  - QA fields,
  - tracked command runner,
  - розширені списки.

## Запуск

```powershell
node status-server.js
```

Потім відкрити:

```text
http://127.0.0.1:8765/
```

## Файли

- `status-server.js` — локальний HTTP server + API.
- `codex-live-dashboard.html` — UI dashboard.
- `run-tracked-command.ps1` — helper для command runner.


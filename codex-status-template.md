# Codex QA Status Footer

Use this compact block at the end of substantial answers when visibility matters.

```text
QA status:
- Verified: <commands/tests/UI/manual checks that were actually run>
- Evidence: <logs/screenshots/artifacts/paths>
- Changed: <files or config touched>
- Unverified: <what was not checked>
- Session/context: <ok / getting large / risk of detail loss>, approximate
```

Use this fuller version for debugging sessions:

```text
QA status:
- Scope: <what was attempted>
- Verified:
  - <check 1>: <result>
  - <check 2>: <result>
- Evidence:
  - <artifact path or screenshot>
  - <important command output summary>
- Changed:
  - <file path>
- Unverified:
  - <remaining risk or blocked check>
- Session/context: <ok / getting large / risk of detail loss>, approximate
- Next best check: <one concrete next verification step>
```

Notes:
- "Session/context" is an estimate unless exact product telemetry is available.
- "Evidence" should point to concrete files, logs, screenshots, command outputs, or visible UI proof.
- Avoid vague claims like "tested everything" without naming the actual checks.

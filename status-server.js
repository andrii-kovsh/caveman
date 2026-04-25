const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
let DatabaseSync = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch {
  DatabaseSync = null;
}

const root = __dirname;
const port = Number(process.env.CODEX_STATUS_PORT || 8765);
const startedAt = new Date();
const statePath = path.join(root, ".codex-status-state.json");
const commandLogPath = path.join(root, ".codex-command-log.jsonl");
const dashboardPath = path.join(root, "codex-live-dashboard.html");
const codexLogsDbPath = process.env.CODEX_LOGS_DB || "C:\\Users\\koban\\.codex\\logs_2.sqlite";
const scanIntervalMs = Number(process.env.CODEX_STATUS_SCAN_INTERVAL_MS || 30000);
const maxScannedFiles = Number(process.env.CODEX_STATUS_MAX_FILES || 2000);
const limitsIntervalMs = Number(process.env.CODEX_LIMITS_REFRESH_MS || 300000);
let statusCache = null;
let statusCacheAt = 0;
let scanInProgress = false;
let limitsCache = null;
let limitsCacheAt = 0;

const ignoredNames = new Set([
  ".git",
  "node_modules",
  ".codex-status-state.json",
  ".codex-command-log.jsonl"
]);

const artifactExts = new Set([
  ".log",
  ".txt",
  ".json",
  ".jsonl",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
  ".mp4",
  ".webm",
  ".zip",
  ".xlsx",
  ".docx",
  ".pptx",
  ".pdf"
]);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function scan(dir, items = []) {
  if (items.length >= maxScannedFiles) return items;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredNames.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(full, items);
      continue;
    }
    if (items.length >= maxScannedFiles) break;
    const stat = fs.statSync(full);
    const rel = path.relative(root, full);
    items.push({
      path: rel,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      mtime: stat.mtime.toISOString(),
      ext: path.extname(entry.name).toLowerCase()
    });
  }
  return items;
}

function commandLog() {
  if (!fs.existsSync(commandLogPath)) return [];
  return fs.readFileSync(commandLogPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-30)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { raw: line };
      }
    });
}

function parseRateLimitEvent(body) {
  const marker = "websocket event:";
  const markerAt = body.indexOf(marker);
  if (markerAt === -1) return null;
  const jsonStart = body.indexOf("{", markerAt);
  if (jsonStart === -1) return null;
  const raw = body.slice(jsonStart).trim();
  try {
    const event = JSON.parse(raw);
    if (event.type !== "codex.rate_limits" || !event.rate_limits) return null;
    return event;
  } catch {
    return null;
  }
}

function normalizeWindow(raw, fallbackLabel) {
  if (!raw) return null;
  const usedPercent = Number(raw.used_percent);
  const resetAtSeconds = Number(raw.reset_at);
  const resetAfterSeconds = Number(raw.reset_after_seconds);
  const windowMinutes = Number(raw.window_minutes);
  const resetAt = Number.isFinite(resetAtSeconds)
    ? new Date(resetAtSeconds * 1000).toISOString()
    : null;
  return {
    label: fallbackLabel,
    usedPercent: Number.isFinite(usedPercent) ? Math.max(0, Math.min(100, Math.round(usedPercent))) : null,
    leftPercent: Number.isFinite(usedPercent) ? Math.max(0, Math.min(100, 100 - Math.round(usedPercent))) : null,
    windowMinutes: Number.isFinite(windowMinutes) ? windowMinutes : null,
    resetAfterSeconds: Number.isFinite(resetAfterSeconds) ? resetAfterSeconds : null,
    resetAt
  };
}

function readCodexRateLimits(force = false) {
  const now = Date.now();
  if (!force && limitsCache && now - limitsCacheAt < limitsIntervalMs) {
    return {
      ...limitsCache,
      cacheAgeMs: now - limitsCacheAt
    };
  }

  const fallback = {
    ok: false,
    source: "codex logs",
    sourcePath: codexLogsDbPath,
    refreshIntervalMs: limitsIntervalMs,
    checkedAt: new Date().toISOString(),
    error: null,
    planType: null,
    allowed: null,
    limitReached: null,
    primary: null,
    secondary: null
  };

  if (!DatabaseSync) {
    limitsCache = { ...fallback, error: "node:sqlite is not available in this Node runtime" };
    limitsCacheAt = now;
    return limitsCache;
  }

  if (!fs.existsSync(codexLogsDbPath)) {
    limitsCache = { ...fallback, error: "Codex logs DB not found" };
    limitsCacheAt = now;
    return limitsCache;
  }

  try {
    const db = new DatabaseSync(codexLogsDbPath, { readOnly: true });
    const rows = db.prepare(`
      select ts, feedback_log_body
      from logs
      where feedback_log_body like '%"type":"codex.rate_limits"%'
      order by id desc
      limit 50
    `).all();
    db.close();

    for (const row of rows) {
      const event = parseRateLimitEvent(String(row.feedback_log_body || ""));
      if (!event) continue;
      const rateLimits = event.rate_limits || {};
      limitsCache = {
        ok: true,
        source: "codex logs websocket event",
        sourcePath: codexLogsDbPath,
        refreshIntervalMs: limitsIntervalMs,
        checkedAt: new Date().toISOString(),
        eventTs: row.ts,
        planType: event.plan_type || null,
        allowed: typeof rateLimits.allowed === "boolean" ? rateLimits.allowed : null,
        limitReached: typeof rateLimits.limit_reached === "boolean" ? rateLimits.limit_reached : null,
        primary: normalizeWindow(rateLimits.primary, "Rolling 5-hour limit"),
        secondary: normalizeWindow(rateLimits.secondary, "Rolling weekly limit")
      };
      limitsCacheAt = now;
      return limitsCache;
    }

    limitsCache = { ...fallback, error: "No codex.rate_limits event found yet" };
    limitsCacheAt = now;
    return limitsCache;
  } catch (error) {
    limitsCache = { ...fallback, error: error.message };
    limitsCacheAt = now;
    return limitsCache;
  }
}

function buildStatus() {
  const files = scan(root).sort((a, b) => b.mtimeMs - a.mtimeMs);
  const changedSinceStart = files.filter((file) => file.mtimeMs >= startedAt.getTime());
  const artifacts = files.filter((file) => artifactExts.has(file.ext));
  const state = readJson(statePath, {
    verified: "",
    evidence: "",
    changed: "",
    unverified: "",
    riskStatus: "Low",
    contextStatus: "ok"
  });
  const logs = commandLog();
  return {
    server: {
      root,
      port,
      startedAt: startedAt.toISOString(),
      now: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt.getTime()) / 1000),
      scanIntervalMs,
      maxScannedFiles,
      scannedFiles: files.length,
      scanLimited: files.length >= maxScannedFiles
    },
    counters: {
      files: files.length,
      changedSinceStart: changedSinceStart.length,
      artifacts: artifacts.length,
      commands: logs.length
    },
    recentFiles: files.slice(0, 20),
    changedSinceStart: changedSinceStart.slice(0, 30),
    artifacts: artifacts.slice(0, 30),
    commands: logs,
    limits: readCodexRateLimits(false),
    state
  };
}

function status(force = false) {
  const now = Date.now();
  if (!force && statusCache && now - statusCacheAt < scanIntervalMs) {
    return {
      ...statusCache,
      server: {
        ...statusCache.server,
        now: new Date().toISOString(),
        uptimeSeconds: Math.floor((now - startedAt.getTime()) / 1000),
        cacheAgeMs: now - statusCacheAt
      }
    };
  }

  if (scanInProgress && statusCache) return statusCache;

  scanInProgress = true;
  try {
    statusCache = buildStatus();
    statusCacheAt = now;
    return statusCache;
  } finally {
    scanInProgress = false;
  }
}

async function runCommand(payload) {
  const command = String(payload.command || "").trim();
  if (!command) return { ok: false, error: "Missing command" };

  const started = new Date();
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: root,
    windowsHide: true
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => { stdout += data.toString(); });
  child.stderr.on("data", (data) => { stderr += data.toString(); });

  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  const entry = {
    command,
    exitCode,
    startedAt: started.toISOString(),
    finishedAt: new Date().toISOString(),
    stdoutTail: stdout.slice(-4000),
    stderrTail: stderr.slice(-4000)
  };
  fs.appendFileSync(commandLogPath, JSON.stringify(entry) + "\n", "utf8");
  return { ok: exitCode === 0, entry };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);

    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard")) {
      return send(res, 200, fs.readFileSync(dashboardPath, "utf8"), "text/html; charset=utf-8");
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      return send(res, 200, JSON.stringify(status(url.searchParams.get("refresh") === "1"), null, 2));
    }

    if (req.method === "GET" && url.pathname === "/api/limits") {
      return send(res, 200, JSON.stringify(readCodexRateLimits(url.searchParams.get("refresh") === "1"), null, 2));
    }

    if (req.method === "POST" && url.pathname === "/api/state") {
      const payload = JSON.parse(await readBody(req) || "{}");
      writeJson(statePath, payload);
      return send(res, 200, JSON.stringify({ ok: true }));
    }

    if (req.method === "POST" && url.pathname === "/api/run") {
      const payload = JSON.parse(await readBody(req) || "{}");
      return send(res, 200, JSON.stringify(await runCommand(payload), null, 2));
    }

    if (req.method === "POST" && url.pathname === "/api/shutdown") {
      send(res, 200, JSON.stringify({ ok: true }));
      setTimeout(() => process.exit(0), 100);
      return;
    }

    send(res, 404, JSON.stringify({ ok: false, error: "Not found" }));
  } catch (error) {
    send(res, 500, JSON.stringify({ ok: false, error: error.message }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Codex status dashboard: http://127.0.0.1:${port}`);
});

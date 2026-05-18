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
const defaultDataDir = "G:\\Stuff\\musor\\codex-live-status-dashboard";
const dataDir = process.env.CODEX_STATUS_DATA_DIR || defaultDataDir;
const artifactDir = process.env.CODEX_STATUS_ARTIFACT_DIR || path.join(dataDir, "artifacts");
const logDir = process.env.CODEX_STATUS_LOG_DIR || path.join(dataDir, "logs");
for (const dir of [dataDir, artifactDir, logDir]) {
  fs.mkdirSync(dir, { recursive: true });
}
const statePath = path.join(dataDir, "codex-status-state.json");
const commandLogPath = path.join(logDir, "codex-command-log.jsonl");
const dashboardPath = path.join(root, "codex-live-dashboard.html");
const codexLogsDbPath = process.env.CODEX_LOGS_DB || "C:\\Users\\koban\\.codex\\logs_2.sqlite";
const scanIntervalMs = Number(process.env.CODEX_STATUS_SCAN_INTERVAL_MS || 120000);
const maxScannedFiles = Number(process.env.CODEX_STATUS_MAX_FILES || 2000);
const limitsIntervalMs = Number(process.env.CODEX_LIMITS_REFRESH_MS || 300000);
const commandBlockLeftPercent = Number(process.env.CODEX_COMMAND_BLOCK_LEFT_PERCENT || 1);
const resourceIntervalMs = Number(process.env.CODEX_RESOURCE_REFRESH_MS || 300000);
let statusCache = null;
let statusCacheAt = 0;
let scanInProgress = false;
let limitsCache = null;
let limitsCacheAt = 0;
let resourcesCache = null;
let resourcesCacheAt = 0;

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

function runPowerShellJson(command) {
  return new Promise((resolve, reject) => {
    const child = spawn("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      command
    ], {
      cwd: root,
      windowsHide: true
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (data) => { stdout += data.toString(); });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      if (exitCode !== 0) {
        reject(new Error(stderr.trim() || `PowerShell exited with ${exitCode}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Failed to parse PowerShell JSON: ${error.message}`));
      }
    });
  });
}

function scan(dir, items = [], base = root, source = "workspace") {
  if (items.length >= maxScannedFiles) return items;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignoredNames.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scan(full, items, base, source);
      continue;
    }
    if (items.length >= maxScannedFiles) break;
    const stat = fs.statSync(full);
    const rel = path.relative(base, full);
    items.push({
      path: source === "workspace" ? rel : `${source}\\${rel}`,
      fullPath: full,
      source,
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

function commandExecutionGuard() {
  const limits = readCodexRateLimits(true);
  const leftPercent = Number(limits && limits.primary && limits.primary.leftPercent);
  const usedPercent = Number(limits && limits.primary && limits.primary.usedPercent);
  const threshold = Number.isFinite(commandBlockLeftPercent) ? commandBlockLeftPercent : 1;
  const blocked = Boolean(limits && limits.ok && Number.isFinite(leftPercent) && leftPercent <= threshold);
  return {
    blocked,
    thresholdPercent: threshold,
    leftPercent: Number.isFinite(leftPercent) ? leftPercent : null,
    usedPercent: Number.isFinite(usedPercent) ? usedPercent : null,
    resetAt: limits && limits.primary ? limits.primary.resetAt : null,
    checkedAt: limits ? limits.checkedAt : null,
    reason: blocked
      ? `Execution blocked: rolling 5-hour limit has ${leftPercent}% left (threshold ${threshold}%).`
      : null
  };
}

async function readResourceSnapshot(force = false) {
  const now = Date.now();
  if (!force && resourcesCache && now - resourcesCacheAt < resourceIntervalMs) {
    return {
      ...resourcesCache,
      cacheAgeMs: now - resourcesCacheAt
    };
  }

  const psScript = `
$ErrorActionPreference = 'Stop'
$sampleDelaySeconds = 1
$targetNames = @('Codex','codex','msedgewebview2','node','node_repl')
$cpuCount = [Environment]::ProcessorCount

function Get-TrackedProcessSnapshot {
  Get-Process -ErrorAction SilentlyContinue |
    Where-Object { $targetNames -contains $_.ProcessName } |
    Select-Object Id, ProcessName, CPU, @{Name='WorkingSetMB';Expression={[math]::Round($_.WorkingSet64 / 1MB, 2)}}, @{Name='PrivateMB';Expression={[math]::Round($_.PrivateMemorySize64 / 1MB, 2)}}
}

$before = Get-TrackedProcessSnapshot
Start-Sleep -Seconds $sampleDelaySeconds
$after = Get-TrackedProcessSnapshot
$beforeById = @{}
foreach ($item in $before) { $beforeById[[string]$item.Id] = $item }

$cimRowsAll = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
$cimById = @{}
$parentNameById = @{}
foreach ($proc in $cimRowsAll) {
  $parentNameById[[string]$proc.ProcessId] = $proc.Name
  $baseName = [IO.Path]::GetFileNameWithoutExtension($proc.Name)
  if ($targetNames -contains $baseName) { $cimById[[string]$proc.ProcessId] = $proc }
}

$procRows = @()
foreach ($item in $after) {
  $key = [string]$item.Id
  $cpuPercent = $null
  if ($beforeById.ContainsKey($key) -and $null -ne $item.CPU -and $null -ne $beforeById[$key].CPU) {
    $delta = [double]$item.CPU - [double]$beforeById[$key].CPU
    $cpuPercent = [math]::Round(([math]::Max(0, $delta) / $sampleDelaySeconds / $cpuCount) * 100, 2)
  }
  $cim = $cimById[$key]
  $parentPid = if ($null -ne $cim) { $cim.ParentProcessId } else { $null }
  $parentName = if ($null -ne $parentPid -and $parentNameById.ContainsKey([string]$parentPid)) { $parentNameById[[string]$parentPid] } else { $null }
  $commandLine = if ($null -ne $cim -and $cim.CommandLine) { ($cim.CommandLine -replace '\\s+', ' ').Trim() } else { $null }
  $ownerHint = $parentName
  if ($item.ProcessName -eq 'msedgewebview2' -and $commandLine -match '--webview-exe-name=([^\\s]+)') {
    $ownerHint = $Matches[1]
  } elseif ($item.ProcessName -eq 'node' -and $commandLine -match 'codex-mem') {
    $ownerHint = 'codex-mem'
  } elseif ($item.ProcessName -eq 'node' -and $commandLine -match 'status-server\\.js') {
    $ownerHint = 'Codex Live Status'
  } elseif ($item.ProcessName -eq 'node' -and $commandLine -match 'media-downloader') {
    $ownerHint = 'Media Tool'
  } elseif ($item.ProcessName -eq 'node' -and $commandLine -match 'Adobe Creative Cloud Experience') {
    $ownerHint = 'Adobe CC'
  }
  $procRows += [pscustomobject]@{
    pid = $item.Id
    name = $item.ProcessName
    parentPid = $parentPid
    parentName = $parentName
    ownerHint = $ownerHint
    commandLine = $commandLine
    cpuPercent = $cpuPercent
    workingSetMB = $item.WorkingSetMB
    privateMB = $item.PrivateMB
  }
}

$groups = $procRows |
  Group-Object name |
  ForEach-Object {
    [pscustomobject]@{
      name = $_.Name
      count = $_.Count
      cpuPercent = [math]::Round((($_.Group | Measure-Object cpuPercent -Sum).Sum), 2)
      workingSetMB = [math]::Round((($_.Group | Measure-Object workingSetMB -Sum).Sum), 2)
      privateMB = [math]::Round((($_.Group | Measure-Object privateMB -Sum).Sum), 2)
    }
  } |
  Sort-Object workingSetMB -Descending

$trackedPids = @{}
foreach ($item in $procRows) { $trackedPids[[string]$item.pid] = $true }

$gpuByPid = @{}
try {
  Get-CimInstance Win32_PerfFormattedData_GPUPerformanceCounters_GPUEngine -ErrorAction Stop |
    Where-Object { $_.Name -match 'pid_([0-9]+)' -and $_.UtilizationPercentage -gt 0 } |
    ForEach-Object {
      $procId = $Matches[1]
      if (-not $trackedPids.ContainsKey($procId)) { return }
      if (-not $gpuByPid.ContainsKey($procId)) { $gpuByPid[$procId] = 0 }
      $gpuByPid[$procId] += [double]$_.UtilizationPercentage
    }
} catch {}

$gpuMemByPid = @{}
try {
  Get-Counter '\\GPU Process Memory(*)\\Local Usage' -ErrorAction Stop |
    Select-Object -ExpandProperty CounterSamples |
    Where-Object { $_.InstanceName -match 'pid_([0-9]+)' } |
    ForEach-Object {
      $procId = $Matches[1]
      if (-not $trackedPids.ContainsKey($procId)) { return }
      if (-not $gpuMemByPid.ContainsKey($procId)) { $gpuMemByPid[$procId] = 0 }
      $gpuMemByPid[$procId] += [double]$_.CookedValue
    }
} catch {}

$processes = $procRows |
  ForEach-Object {
    $procId = [string]$_.pid
    [pscustomobject]@{
      pid = $_.pid
      name = $_.name
      parentPid = $_.parentPid
      parentName = $_.parentName
      ownerHint = $_.ownerHint
      commandLine = $_.commandLine
      cpuPercent = $_.cpuPercent
      workingSetMB = $_.workingSetMB
      privateMB = $_.privateMB
      gpuPercent = if ($gpuByPid.ContainsKey($procId)) { [math]::Round($gpuByPid[$procId], 2) } else { 0 }
      gpuMemoryMB = if ($gpuMemByPid.ContainsKey($procId)) { [math]::Round($gpuMemByPid[$procId] / 1MB, 2) } else { 0 }
    }
  } |
  Sort-Object workingSetMB -Descending

$groupMetrics = @{}
foreach ($group in $groups) {
  $name = $group.name
  $matching = @($processes | Where-Object name -eq $name)
  $groupMetrics[$name] = [pscustomobject]@{
    name = $name
    count = $group.count
    cpuPercent = $group.cpuPercent
    workingSetMB = $group.workingSetMB
    privateMB = $group.privateMB
    gpuPercent = [math]::Round((($matching | Measure-Object gpuPercent -Sum).Sum), 2)
    gpuMemoryMB = [math]::Round((($matching | Measure-Object gpuMemoryMB -Sum).Sum), 2)
  }
}

[pscustomobject]@{
  ok = $true
  checkedAt = [DateTime]::UtcNow.ToString('o')
  refreshIntervalMs = ${resourceIntervalMs}
  groups = $groups
  processes = $processes | Select-Object -First 20
  summary = [pscustomobject]@{
    codex = $groupMetrics['Codex']
    codexLower = $groupMetrics['codex']
    webview = $groupMetrics['msedgewebview2']
    node = $groupMetrics['node']
    nodeRepl = $groupMetrics['node_repl']
  }
} | ConvertTo-Json -Depth 6 -Compress
`;

  try {
    resourcesCache = await runPowerShellJson(psScript);
  } catch (error) {
    resourcesCache = {
      ok: false,
      checkedAt: new Date().toISOString(),
      refreshIntervalMs: resourceIntervalMs,
      error: error.message,
      groups: [],
      processes: [],
      summary: {}
    };
  }

  resourcesCacheAt = now;
  return resourcesCache;
}

function buildStatus() {
  const files = scan(root).sort((a, b) => b.mtimeMs - a.mtimeMs);
  const dataFiles = fs.existsSync(dataDir)
    ? scan(dataDir, [], dataDir, "data").sort((a, b) => b.mtimeMs - a.mtimeMs)
    : [];
  const changedSinceStart = files.filter((file) => file.mtimeMs >= startedAt.getTime());
  const artifacts = files
    .concat(dataFiles)
    .filter((file) => artifactExts.has(file.ext))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
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
      dataDir,
      artifactDir,
      logDir,
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

  const guard = commandExecutionGuard();
  if (guard.blocked) {
    const now = new Date();
    const entry = {
      command,
      blocked: true,
      exitCode: null,
      startedAt: now.toISOString(),
      finishedAt: now.toISOString(),
      stdoutTail: "",
      stderrTail: guard.reason
    };
    fs.appendFileSync(commandLogPath, JSON.stringify(entry) + "\n", "utf8");
    return { ok: false, blocked: true, error: guard.reason, guard, entry };
  }

  const started = new Date();
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    cwd: root,
    windowsHide: true
  });

  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (data) => { stdout += data.toString(); });
  child.stderr.on("data", (data) => { stderr += data.toString(); });

  const exitCode = await new Promise((resolve, reject) => {
    let settled = false;
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
    child.once("close", (code) => {
      if (settled) return;
      settled = true;
      resolve(code);
    });
  });
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

    if (req.method === "GET" && url.pathname === "/api/resources") {
      return send(res, 200, JSON.stringify(await readResourceSnapshot(url.searchParams.get("refresh") === "1"), null, 2));
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

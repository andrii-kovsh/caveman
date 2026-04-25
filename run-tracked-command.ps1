param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Command
)

$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$DataDir = if ($env:CODEX_STATUS_DATA_DIR) { $env:CODEX_STATUS_DATA_DIR } else { "G:\Stuff\musor\codex-live-status-dashboard" }
$LogDir = if ($env:CODEX_STATUS_LOG_DIR) { $env:CODEX_STATUS_LOG_DIR } else { Join-Path $DataDir "logs" }
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
$LogPath = Join-Path $LogDir "codex-command-log.jsonl"
$StartedAt = Get-Date

Push-Location $Root
try {
  $Output = Invoke-Expression $Command 2>&1 | Out-String
  $ExitCode = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 0 }
} catch {
  $Output = $_ | Out-String
  $ExitCode = 1
} finally {
  Pop-Location
}

$Entry = [ordered]@{
  command = $Command
  exitCode = $ExitCode
  startedAt = $StartedAt.ToUniversalTime().ToString("o")
  finishedAt = (Get-Date).ToUniversalTime().ToString("o")
  stdoutTail = if ($Output.Length -gt 4000) { $Output.Substring($Output.Length - 4000) } else { $Output }
  stderrTail = ""
}

($Entry | ConvertTo-Json -Compress) | Add-Content -Path $LogPath -Encoding UTF8
Write-Output $Output
exit $ExitCode

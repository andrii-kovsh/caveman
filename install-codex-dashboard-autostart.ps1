$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName = "Codex Live Status Dashboard"
$Launcher = Join-Path $Root "start-codex-status-server.vbs"
$NodePath = "C:\Program Files\nodejs\node.exe"
$Server = Join-Path $Root "status-server.js"

if (-not (Test-Path $Launcher)) {
  throw "Missing launcher: $Launcher"
}

if (-not (Test-Path $Server)) {
  throw "Missing server: $Server"
}

if (-not (Test-Path $NodePath)) {
  Write-Warning "Explicit Node runtime not found at $NodePath. Launcher will fall back to PATH."
}

$Action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$Launcher`""
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$Principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 7) `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null

$Task = Get-ScheduledTask -TaskName $TaskName
$Task.Settings.Hidden = $true
$Task | Set-ScheduledTask | Out-Null

Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Milliseconds 900

$Ready = $false
try {
  $Status = Invoke-RestMethod -Uri "http://127.0.0.1:8765/api/status" -TimeoutSec 3
  $Ready = $true
} catch {
  $Status = $null
}

[ordered]@{
  ok = $Ready
  taskName = $TaskName
  taskState = (Get-ScheduledTask -TaskName $TaskName).State.ToString()
  hidden = (Get-ScheduledTask -TaskName $TaskName).Settings.Hidden
  url = "http://127.0.0.1:8765"
  counters = if ($Status) { $Status.counters } else { $null }
} | ConvertTo-Json -Depth 4

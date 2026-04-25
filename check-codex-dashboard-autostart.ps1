$TaskName = "Codex Live Status Dashboard"

$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
$TaskInfo = if ($Task) { Get-ScheduledTaskInfo -TaskName $TaskName } else { $null }

try {
  $Status = Invoke-RestMethod -Uri "http://127.0.0.1:8765/api/status" -TimeoutSec 3
  $ApiOk = $true
} catch {
  $Status = $null
  $ApiOk = $false
}

[ordered]@{
  taskRegistered = [bool]$Task
  taskState = if ($Task) { $Task.State.ToString() } else { $null }
  hidden = if ($Task) { $Task.Settings.Hidden } else { $null }
  lastRunTime = if ($TaskInfo) { $TaskInfo.LastRunTime.ToString("o") } else { $null }
  lastTaskResult = if ($TaskInfo) { $TaskInfo.LastTaskResult } else { $null }
  apiOk = $ApiOk
  url = "http://127.0.0.1:8765"
  counters = if ($Status) { $Status.counters } else { $null }
} | ConvertTo-Json -Depth 4

$ErrorActionPreference = "Stop"

$TaskName = "Codex Live Status Dashboard"

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  [ordered]@{
    ok = $true
    removed = $TaskName
  } | ConvertTo-Json
} else {
  [ordered]@{
    ok = $true
    removed = $null
    message = "Task was not registered."
  } | ConvertTo-Json
}

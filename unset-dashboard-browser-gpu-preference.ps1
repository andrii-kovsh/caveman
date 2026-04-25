$ErrorActionPreference = "Stop"

$Key = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
$Candidates = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

$Removed = @()
if (Test-Path $Key) {
  foreach ($Path in $Candidates) {
    if (Get-ItemProperty -Path $Key -Name $Path -ErrorAction SilentlyContinue) {
      Remove-ItemProperty -Path $Key -Name $Path -ErrorAction SilentlyContinue
      $Removed += $Path
    }
  }
}

[ordered]@{
  ok = $true
  removed = $Removed
} | ConvertTo-Json -Depth 3

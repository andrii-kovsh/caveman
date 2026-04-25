$ErrorActionPreference = "Stop"

$Key = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
$Candidates = @(
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)

if (-not (Test-Path $Key)) {
  New-Item -Path $Key -Force | Out-Null
}

$Applied = @()
foreach ($Path in $Candidates) {
  if (Test-Path $Path) {
    New-ItemProperty -Path $Key -Name $Path -Value "GpuPreference=1;" -PropertyType String -Force | Out-Null
    $Applied += $Path
  }
}

[ordered]@{
  ok = $Applied.Count -gt 0
  preference = "Power saving / integrated GPU when Windows honors the preference"
  appliedTo = $Applied
  note = "Restart browser windows for the setting to take effect."
} | ConvertTo-Json -Depth 3

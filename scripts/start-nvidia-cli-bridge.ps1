[CmdletBinding()]
param([switch]$InstallStartup)
$ErrorActionPreference = 'Stop'

# Credentials remain in each CLI's private configuration. This launcher only
# installs the compatibility source, private operational logs and a loopback service.
$bridgeDirectory = Join-Path $env:LOCALAPPDATA 'MIRO\nvidia-cli-bridge'
$sourceBridge = Join-Path $PSScriptRoot 'nvidia-cli-bridge.mjs'
$installedBridge = Join-Path $bridgeDirectory 'nvidia-cli-bridge.mjs'
$installedStarter = Join-Path $bridgeDirectory 'start-nvidia-cli-bridge.ps1'
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $sourceBridge)) { throw 'Bridge source is missing beside this starter.' }
New-Item -ItemType Directory -Path $bridgeDirectory -Force | Out-Null
$ownerSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls $bridgeDirectory /inheritance:r /grant:r "*${ownerSid}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Unable to protect the bridge directory.' }

function Read-BridgeHealth {
  try { return Invoke-RestMethod -Uri 'http://127.0.0.1:19119/health' -TimeoutSec 2 }
  catch { return $null }
}
$health = Read-BridgeHealth
if ($health -and ($health.service -ne 'miro-nvidia-cli-bridge' -or $health.version -ne 2 -or $health.maxAttempts -ne 20)) {
  throw 'Port 19119 already has another/older service. Save active CLI work, stop that service deliberately, and rerun. No process was terminated.'
}
if ([IO.Path]::GetFullPath($sourceBridge) -ne [IO.Path]::GetFullPath($installedBridge)) {
  Copy-Item -LiteralPath $sourceBridge -Destination $installedBridge -Force
  Copy-Item -LiteralPath $PSCommandPath -Destination $installedStarter -Force
}
if (-not $health) {
  $process = Start-Process -FilePath $nodePath -ArgumentList @('"' + $installedBridge + '"') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $bridgeDirectory 'stdout.log') -RedirectStandardError (Join-Path $bridgeDirectory 'stderr.log')
  Set-Content -LiteralPath (Join-Path $bridgeDirectory 'bridge.pid') -Value $process.Id
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 100
    $health = Read-BridgeHealth
    if ($health) { break }
    if ($process.HasExited) { throw 'Bridge startup failed; inspect the private operational log.' }
  }
  if (-not $health -or $health.service -ne 'miro-nvidia-cli-bridge' -or $health.version -ne 2 -or $health.maxAttempts -ne 20) { throw 'Bridge did not report the expected health contract.' }
}
if ($InstallStartup) {
  # Startup handles login persistence, not supervision after a later crash.
  $startupFile = Join-Path ([Environment]::GetFolderPath('Startup')) 'MIRO NVIDIA Bridge.vbs'
  $launcher = @"
Set shell = CreateObject("WScript.Shell")
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""$installedStarter""", 0, False
"@
  Set-Content -LiteralPath $startupFile -Value $launcher -Encoding Unicode
}
Write-Output 'MIRO NVIDIA bridge is healthy on loopback: version 2, up to 20 upstream attempts.'

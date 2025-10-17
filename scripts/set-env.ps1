param(
  [string]$EnvFilePath = "$PSScriptRoot/../.env"
)

if (!(Test-Path $EnvFilePath)) {
  Write-Output ".env not found at $EnvFilePath. Copy .env.example to .env and fill values."
  return
}

Get-Content $EnvFilePath | ForEach-Object {
  $line = $_.Trim()
  if ($line -eq '' -or $line.StartsWith('#')) { return }
  $kv = $line -split '=', 2
  if ($kv.Length -eq 2) {
    $key = $kv[0].Trim()
    $val = $kv[1].Trim()
    # Strip inline comments
    if ($val -match '^([^#]+)') { $val = $matches[1].Trim() }
    # Strip optional quotes
    if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length-2) }
    if ($val.StartsWith("'") -and $val.EndsWith("'")) { $val = $val.Substring(1, $val.Length-2) }
    if ($val -ne '') { Set-Item -Path Env:\$key -Value $val | Out-Null }
  }
}

Write-Output "Loaded environment from $EnvFilePath"

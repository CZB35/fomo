param(
  [string]$To = $env:DEV_ADDR,
  [string]$Amount = "1000000000000"  # 1,000,000 * 1e6
)

. "$PSScriptRoot/set-env.ps1"

if (-not $env:RPC_URL) { Write-Error "RPC_URL not set"; exit 1 }
if (-not $env:PRIVATE_KEY) { Write-Error "PRIVATE_KEY not set"; exit 1 }
if (-not $env:TOKEN) { Write-Error "TOKEN not set (MockUSDT address)"; exit 1 }
if (-not $To) { $To = $env:DEV_ADDR }
if (-not $To) { Write-Error "No target address provided (set DEV_ADDR or pass -To)"; exit 1 }

cast send $env:TOKEN "mint(address,uint256)" $To $Amount --rpc-url $env:RPC_URL --private-key $env:PRIVATE_KEY
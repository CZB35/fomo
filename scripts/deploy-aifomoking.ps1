param()

. "$PSScriptRoot/set-env.ps1"

if (-not $env:RPC_URL) { Write-Error "RPC_URL not set"; exit 1 }
if (-not $env:PRIVATE_KEY) { Write-Error "PRIVATE_KEY not set"; exit 1 }
if (-not $env:TOKEN) { Write-Error "TOKEN not set"; exit 1 }
if (-not $env:DEV_WALLET) { Write-Error "DEV_WALLET not set"; exit 1 }

forge script script/Deploy.s.sol:Deploy --rpc-url $env:RPC_URL --private-key $env:PRIVATE_KEY --broadcast
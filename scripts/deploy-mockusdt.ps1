param()

. "$PSScriptRoot/set-env.ps1"

if (-not $env:RPC_URL) { Write-Error "RPC_URL not set"; exit 1 }
if (-not $env:PRIVATE_KEY) { Write-Error "PRIVATE_KEY not set"; exit 1 }

forge create src/mocks/MockUSDT.sol:MockUSDT --rpc-url $env:RPC_URL --private-key $env:PRIVATE_KEY
# Copies the Creem settings in .env.local (key, webhook secret, packs) to the
# live Cloud Run service in one new revision; every other setting is kept.
#   ./scripts/creem-push.ps1
# Only which mode the key is in is printed, never the key itself.
$ErrorActionPreference = "Stop"

function Get-Local([string]$Name) {
  $line = Select-String -Path .env.local -Pattern "^$Name=(.+)$" | Select-Object -First 1
  if (-not $line) { throw "$Name is empty in .env.local." }
  return $line.Matches[0].Groups[1].Value.Trim()
}

$key = Get-Local "CREEM_API_KEY"
$secret = Get-Local "CREEM_WEBHOOK_SECRET"
$products = Get-Local "CREEM_PRODUCTS"
if (($products -split ";").Count -ne 4) { throw "CREEM_PRODUCTS should list the 4 packs: run npm run creem:setup first." }
$mode = if ($key.StartsWith("creem_test_")) { "TEST" } else { "LIVE" }

Write-Host "Sending the $mode Creem settings to Cloud Run (simubox, us-west1)..."
# None of the values contain commas, gcloud's separator.
gcloud run services update simubox --region us-west1 --project creatora-492209 --account neurasphere.group@gmail.com `
  --update-env-vars "CREEM_API_KEY=$key,CREEM_WEBHOOK_SECRET=$secret,CREEM_PRODUCTS=$products"
if ($LASTEXITCODE -ne 0) { throw "gcloud failed; nothing was changed." }
Write-Host "Done: the live site now takes $mode payments."

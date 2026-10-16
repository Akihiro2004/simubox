# Deploys SimuBox to Cloud Run from source: Cloud Build builds the Dockerfile
# remotely (local Docker is optional, for testing: see README).
# Gemini auth, pick one:
#   default      Vertex AI with the service's own identity (no key stored)
#   -UseApiKey   your AI Studio key (GEMINI_API_KEY from the environment or
#                .env.local), stored in Secret Manager, never in the image
#
# Usage:  ./scripts/deploy.ps1 -Project my-project [-Region asia-southeast1] [-UseApiKey]
#         [-FirebaseApiKey ... -FirebaseAuthDomain ... -FirebaseAppId ... -FirebaseProjectId ...]
param(
  [Parameter(Mandatory = $true)][string]$Project,
  [string]$Region = "asia-southeast1",
  [string]$Service = "simubox",
  [string]$Model = "gemini-3.8-flash",
  [string]$FirebaseApiKey = "",
  [string]$FirebaseAuthDomain = "",
  [string]$FirebaseAppId = "",
  [string]$FirebaseProjectId = "",
  [switch]$UseApiKey
)
$ErrorActionPreference = "Stop"

gcloud config set project $Project | Out-Null
Write-Host "Enabling APIs (Run, Cloud Build, Artifact Registry, Vertex AI)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com secretmanager.googleapis.com

# Least privilege: a dedicated runtime identity that may only call Vertex AI.
$sa = "$Service-runtime@$Project.iam.gserviceaccount.com"
$existing = gcloud iam service-accounts list --filter="email:$sa" --format="value(email)"
if (-not $existing) {
  gcloud iam service-accounts create "$Service-runtime" --display-name "SimuBox runtime"
}
gcloud projects add-iam-policy-binding $Project --member "serviceAccount:$sa" --role "roles/aiplatform.user" --condition=None | Out-Null

$secretArgs = @()
if ($UseApiKey) {
  $key = $env:GEMINI_API_KEY
  if (-not $key -and (Test-Path .env.local)) {
    $line = Select-String -Path .env.local -Pattern '^GEMINI_API_KEY=(.+)$' | Select-Object -First 1
    if ($line) { $key = $line.Matches[0].Groups[1].Value.Trim() }
  }
  if (-not $key) { throw "Set GEMINI_API_KEY (or put it in .env.local) to use -UseApiKey." }
  $exists = gcloud secrets list --filter="name:gemini-api-key" --format="value(name)"
  if (-not $exists) { gcloud secrets create gemini-api-key --replication-policy automatic | Out-Null }
  # Pipe the key in so it never appears on a command line or in history.
  $key | gcloud secrets versions add gemini-api-key --data-file=- | Out-Null
  gcloud secrets add-iam-policy-binding gemini-api-key --member "serviceAccount:$sa" --role "roles/secretmanager.secretAccessor" | Out-Null
  $envVars = "GEMINI_MODEL=$Model"
  $secretArgs = @("--set-secrets", "GEMINI_API_KEY=gemini-api-key:latest")
} else {
  $envVars = "GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=$Project,GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=$Model"
}
if ($FirebaseApiKey) {
  $fbProject = if ($FirebaseProjectId) { $FirebaseProjectId } else { $Project }
  $envVars += ",FIREBASE_API_KEY=$FirebaseApiKey,FIREBASE_AUTH_DOMAIN=$FirebaseAuthDomain,FIREBASE_PROJECT_ID=$fbProject,FIREBASE_APP_ID=$FirebaseAppId"
}

# Spending guard: scale to zero, at most 3 instances.
gcloud run deploy $Service `
  --source . `
  --region $Region `
  --service-account $sa `
  --allow-unauthenticated `
  --min-instances 0 `
  --max-instances 3 `
  --memory 1Gi `
  --cpu 1 `
  --concurrency 40 `
  --timeout 120 `
  --set-env-vars $envVars `
  @secretArgs

$url = gcloud run services describe $Service --region $Region --format="value(status.url)"
Write-Host "Deployed: $url"
Write-Host "Health:   $url/api/health"

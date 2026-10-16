# Deploys SimuBox to Cloud Run from source (Cloud Build builds the Dockerfile
# remotely; no local Docker needed). Gemini runs through Vertex AI with the
# service's own identity, so there is no API key to store.
#
# Usage:  ./scripts/deploy.ps1 -Project my-project [-Region asia-southeast1]
#         [-FirebaseApiKey ... -FirebaseAuthDomain ... -FirebaseAppId ...]
param(
  [Parameter(Mandatory = $true)][string]$Project,
  [string]$Region = "asia-southeast1",
  [string]$Service = "simubox",
  [string]$Model = "gemini-3.8-flash",
  [string]$FirebaseApiKey = "",
  [string]$FirebaseAuthDomain = "",
  [string]$FirebaseAppId = ""
)
$ErrorActionPreference = "Stop"

gcloud config set project $Project | Out-Null
Write-Host "Enabling APIs (Run, Cloud Build, Artifact Registry, Vertex AI)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com

# Least privilege: a dedicated runtime identity that may only call Vertex AI.
$sa = "$Service-runtime@$Project.iam.gserviceaccount.com"
$existing = gcloud iam service-accounts list --filter="email:$sa" --format="value(email)"
if (-not $existing) {
  gcloud iam service-accounts create "$Service-runtime" --display-name "SimuBox runtime"
}
gcloud projects add-iam-policy-binding $Project --member "serviceAccount:$sa" --role "roles/aiplatform.user" --condition=None | Out-Null

$envVars = "GOOGLE_GENAI_USE_VERTEXAI=true,GOOGLE_CLOUD_PROJECT=$Project,GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=$Model"
if ($FirebaseApiKey) {
  $envVars += ",FIREBASE_API_KEY=$FirebaseApiKey,FIREBASE_AUTH_DOMAIN=$FirebaseAuthDomain,FIREBASE_PROJECT_ID=$Project,FIREBASE_APP_ID=$FirebaseAppId"
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
  --set-env-vars $envVars

$url = gcloud run services describe $Service --region $Region --format="value(status.url)"
Write-Host "Deployed: $url"
Write-Host "Health:   $url/api/health"

param(
  [Parameter(Mandatory=$true)][string]$Token,
  [string]$FirebaseJson = ""
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$vars = @(
  @{ Name = "NODE_ENV";           Value = "production" },
  @{ Name = "GEMINI_MODEL";       Value = "gemini-2.5-flash-lite" },
  @{ Name = "FIREBASE_PROJECT_ID";Value = "docrisk-sri-lanka" },
  @{ Name = "RATE_LIMIT_ENABLED"; Value = "true" },
  @{ Name = "CORS_ORIGINS";       Value = "https://doc-risk-sri-lanka.vercel.app,*.vercel.app,http://localhost:5173" },
  @{ Name = "GEMINI_API_KEY";     Value = $env:GEMINI_API_KEY_VAL }
)

if ($FirebaseJson -ne "") {
  $vars += @{ Name = "FIREBASE_SERVICE_ACCOUNT_JSON"; Value = $FirebaseJson }
}

$envs = @("production", "development")

foreach ($v in $vars) {
  if (-not $v.Value) { Write-Host "SKIP $($v.Name) (empty value)"; continue }
  foreach ($e in $envs) {
    Write-Host "==> $($v.Name) [$e]"
    & npx --yes vercel env rm $v.Name $e --yes --token $Token 2>&1 | Out-Null
    $v.Value | & npx --yes vercel env add $v.Name $e --token $Token 2>&1 | Out-Null
  }
  Write-Host "==> $($v.Name) [preview]"
  & npx --yes vercel env rm $v.Name preview --yes --token $Token 2>&1 | Out-Null
  & npx --yes vercel env add $v.Name preview --value $v.Value --yes --token $Token 2>&1 | Out-Null
}

Write-Host ""
Write-Host "Done. Final list:"
& npx --yes vercel env ls --token $Token 2>&1

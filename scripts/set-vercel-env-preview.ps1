param(
  [Parameter(Mandatory=$true)][string]$Token
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

$vars = @(
  @{ Name = "VITE_API_URL";                       Value = "https://docrisk-server.onrender.com" },
  @{ Name = "VITE_FIREBASE_API_KEY";              Value = "AIzaSyB1VBgYhy-ORIftDqyTHODYLBkWBSXFbEY" },
  @{ Name = "VITE_FIREBASE_AUTH_DOMAIN";          Value = "docrisk-sri-lanka.firebaseapp.com" },
  @{ Name = "VITE_FIREBASE_PROJECT_ID";           Value = "docrisk-sri-lanka" },
  @{ Name = "VITE_FIREBASE_STORAGE_BUCKET";       Value = "docrisk-sri-lanka.firebasestorage.app" },
  @{ Name = "VITE_FIREBASE_MESSAGING_SENDER_ID";  Value = "219545765867" },
  @{ Name = "VITE_FIREBASE_APP_ID";               Value = "1:219545765867:web:a21008f9626b119fd5fbae" }
)

foreach ($v in $vars) {
  Write-Host "==> $($v.Name) [preview]"
  & npx --yes vercel env rm $v.Name preview --yes --token $Token 2>&1 | Out-Null
  & npx --yes vercel env add $v.Name preview --value $v.Value --yes --token $Token 2>&1 | Out-Null
}

Write-Host ""
Write-Host "Final env list:"
& npx --yes vercel env ls --token $Token 2>&1

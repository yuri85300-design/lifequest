# PRIME: signature permanente pour les APK futures. A executer une seule fois sur VOTRE PC.
# Prerequis: Java JDK (keytool), GitHub CLI (gh), authentification : gh auth login.
$ErrorActionPreference = "Stop"
$repo = "yuri85300-design/lifequest"
if (-not (Get-Command keytool -ErrorAction SilentlyContinue)) { throw "Installer le JDK 17 ou supérieur (keytool)." }
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw "Installer GitHub CLI (gh)." }
& gh auth status
if ($LASTEXITCODE -ne 0) { throw "Se connecter avec gh auth login." }
$dir = Join-Path $env:USERPROFILE ".prime-android-signing"
New-Item -Path $dir -ItemType Directory -Force | Out-Null
$key = Join-Path $dir "prime-release.p12"
if (Test-Path $key) {
  Write-Host "Cle existante detectee, elle sera reutilisee : $key"
} else {
  Write-Host "Creation de la cle permanente PRIME."
}
$secure = Read-Host "Mot de passe fort de la signature" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
if ($password.Length -lt 12) { throw "Mot de passe de 12 caracteres minimum." }
try {
  $env:PRIME_SIGNING_PASSWORD = $password
  if (-not (Test-Path $key)) {
    $arguments = @("-genkeypair","-alias","septgigs","-keyalg","RSA","-keysize","4096","-validity","10000","-storetype","PKCS12","-keystore",$key,"-storepass:env","PRIME_SIGNING_PASSWORD","-keypass:env","PRIME_SIGNING_PASSWORD","-dname","CN=7 Gigs PRIME permanent release","-noprompt")
    & keytool @arguments
    if ($LASTEXITCODE -ne 0) { throw "Creation cle impossible." }
  }
  & keytool -list -alias septgigs -keystore $key -storepass:env PRIME_SIGNING_PASSWORD | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Cle invalide ou mot de passe incorrect." }
  $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($key))
  $b64 | & gh secret set PRIME_KEYSTORE_B64 --repo $repo
  if ($LASTEXITCODE -ne 0) { throw "Erreur secret GitHub PRIME_KEYSTORE_B64." }
  $password | & gh secret set PRIME_KEYSTORE_PASS --repo $repo
  if ($LASTEXITCODE -ne 0) { throw "Erreur secret GitHub PRIME_KEYSTORE_PASS." }
  Write-Host "Signature permanente securisee dans les secrets GitHub Actions."
  Write-Host "Sauvegardez une copie SECURISEE du fichier hors du PC : $key"
  Write-Host "Ne partagez jamais le fichier .p12 ou son mot de passe."
  Write-Host "Relancez le workflow Build PRIME 2.5.0 depuis Actions pour votre APK definitive."
} finally {
  Remove-Item Env:PRIME_SIGNING_PASSWORD -ErrorAction SilentlyContinue
  $password = $null
  $b64 = $null
}

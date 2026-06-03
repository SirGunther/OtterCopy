# scripts/win/gitcommit.ps1

$ErrorActionPreference = "Stop"

function Confirm-YesNo {
  param([string]$Question)

  $answer = Read-Host "$Question [y/N]"
  return $answer -match '^(y|yes)$'
}

function Invoke-GitCommand {
  param(
    [string[]]$GitArgs
  )

  Write-Host "`n> git $($GitArgs -join ' ')" -ForegroundColor Cyan
  & git @GitArgs

  if ($LASTEXITCODE -ne 0) {
    Write-Host "`nStopped because Git returned an error." -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

$currentBranch = (& git branch --show-current).Trim()

Write-Host "`nCurrent branch: $currentBranch" -ForegroundColor Yellow

if (Confirm-YesNo "Commit to main? No = commit to '$currentBranch'") {
  $targetBranch = "main"

  if ($currentBranch -ne "main") {
    Invoke-GitCommand @("switch", "main")
  }
} else {
  $targetBranch = $currentBranch
}

$message = Read-Host "`nCommit message"

Invoke-GitCommand @("add", "-A")
Invoke-GitCommand @("commit", "-m", $message)
Invoke-GitCommand @("pull", "--rebase", "origin", $targetBranch)
Invoke-GitCommand @("push", "-u", "origin", "HEAD")

$commitSha = (& git rev-parse HEAD).Trim()
$commitSha | Set-Clipboard

Write-Host "`nCommitted and pushed:" -ForegroundColor Green
Write-Host $commitSha
Write-Host "Commit SHA copied to clipboard." -ForegroundColor Green
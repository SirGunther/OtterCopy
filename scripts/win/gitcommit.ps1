# scripts/win/gitcommit.ps1

$ErrorActionPreference = "Stop"

function Confirm-YesNo {
  param(
    [string]$Question,
    [bool]$DefaultYes = $true
  )

  $suffix = if ($DefaultYes) { "[Y/n]" } else { "[y/N]" }
  $answer = Read-Host "$Question $suffix"

  if ([string]::IsNullOrWhiteSpace($answer)) {
    return $DefaultYes
  }

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

if ($currentBranch -eq "main") {
  $targetBranch = "main"
  Write-Host "Already on main." -ForegroundColor Yellow
} else {
  $useCurrentBranch = Confirm-YesNo "Commit to current branch '$currentBranch'? No = switch to main"

  if ($useCurrentBranch) {
    $targetBranch = $currentBranch
  } else {
    $targetBranch = "main"
    Invoke-GitCommand @("switch", "main")
  }
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
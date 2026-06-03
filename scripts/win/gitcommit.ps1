# scripts/win/gitcommit.ps1

function Confirm-YesNo {
    param(
      [string]$Question,
      [bool]$DefaultYes = $false
    )
  
    $suffix = if ($DefaultYes) { "[Y/n]" } else { "[y/N]" }
    $answer = Read-Host "$Question $suffix"
  
    if ([string]::IsNullOrWhiteSpace($answer)) {
      return $DefaultYes
    }
  
    return $answer -match '^(y|yes)$'
  }
  
  function Invoke-Git {
    param(
      [Parameter(ValueFromRemainingArguments = $true)]
      [string[]]$GitArgs
    )
  
    Write-Host "`n> git $($GitArgs -join ' ')" -ForegroundColor Cyan
    & git @GitArgs
  
    if ($LASTEXITCODE -ne 0) {
      Write-Host "`nGit command failed. Stopping." -ForegroundColor Red
      exit $LASTEXITCODE
    }
  }
  
  $currentBranch = (& git branch --show-current).Trim()
  
  if (-not $currentBranch) {
    Write-Host "You appear to be in detached HEAD state. Stopping." -ForegroundColor Red
    exit 1
  }
  
  Write-Host "`nCurrent branch: $currentBranch" -ForegroundColor Yellow
  
  $useMain = Confirm-YesNo "Commit to main? Choose No to use current branch '$currentBranch'"
  
  if ($useMain) {
    $targetBranch = "main"
  
    if ($currentBranch -ne "main") {
      Invoke-Git switch main
    }
  } else {
    $targetBranch = $currentBranch
  }
  
  $message = Read-Host "`nCommit message"
  
  if ([string]::IsNullOrWhiteSpace($message)) {
    Write-Host "Commit message cannot be empty. Stopping." -ForegroundColor Red
    exit 1
  }
  
  Write-Host "`nCurrent changes:" -ForegroundColor Yellow
  git status --short
  
  $changes = git status --porcelain
  
  if (-not $changes) {
    Write-Host "`nNo changes to commit." -ForegroundColor Green
    exit 0
  }
  
  if (-not (Confirm-YesNo "Stage all changes with git add -A?")) {
    Write-Host "Cancelled before staging."
    exit 0
  }
  
  Invoke-Git add -A
  
  Write-Host "`nStaged changes:" -ForegroundColor Yellow
  git status --short
  
  if (-not (Confirm-YesNo "Commit with message '$message'?")) {
    Write-Host "Cancelled before commit."
    exit 0
  }
  
  Invoke-Git commit -m $message
  
  if (Confirm-YesNo "Pull latest changes from origin/$targetBranch with rebase?" $true) {
    Invoke-Git pull --rebase origin $targetBranch
  }
  
  if (-not (Confirm-YesNo "Push to GitHub?" $true)) {
    Write-Host "Committed locally, but not pushed."
    exit 0
  }
  
  Invoke-Git push -u origin HEAD
  
  Write-Host "`nFinal commit hash:" -ForegroundColor Green
  git rev-parse HEAD
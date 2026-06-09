[CmdletBinding()]
param(
    [ValidateSet("success", "fail", "info")]
    [string]$Status = "success",

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$Message,

    [string]$EndpointUrl = "https://default7318a4272f81408f83866569e958a8.70.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f2a0e9254fd449419d56fe073a5c2c92/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=JCFHJI0-IFhMnbW8KKb_u2U5l71lGAwC9t7twob_P2E",

    [switch]$FailOnError
)

$payload = @{
    status = $Status.ToLowerInvariant()
    message = $Message.Trim()
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    source = "agent"
    repository = "SirGunther/OtterCopy"
}

try {
    Invoke-RestMethod `
        -Uri $EndpointUrl `
        -Method Post `
        -ContentType "application/json" `
        -Body ($payload | ConvertTo-Json -Compress) |
        Out-Null

    Write-Host "Agent completion notification sent."
}
catch {
    Write-Warning "Agent completion notification failed: $($_.Exception.Message)"

    if ($FailOnError) {
        exit 1
    }
}

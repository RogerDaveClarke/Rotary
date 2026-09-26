param(
    [string]$ProjectId = 'your-gcp-project-id',
    [string]$Region = 'us-west1',
    [string]$Service = 'rotary-wallet-card-generator',
    [string]$ServiceAccountEmail = 'card-signer@your-gcp-project-id.iam.gserviceaccount.com',
    [string]$PublicBaseUrl = 'https://your-service-url.example.com'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-DotEnv([string]$Path) {
    $values = @{}

    foreach ($line in [IO.File]::ReadAllLines($Path)) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) {
            continue
        }

        if ($trimmed -match '^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $key = $Matches[1]
            $value = $Matches[2].Trim()
            if ($value.Length -ge 2 -and (($value[0] -eq '"' -and $value[$value.Length - 1] -eq '"') -or ($value[0] -eq "'" -and $value[$value.Length - 1] -eq "'"))) {
                $value = $value.Substring(1, $value.Length - 2)
            }
            $values[$key] = $value
        }
    }

    return $values
}

function Invoke-Gcloud([string[]]$Arguments) {
    $previousErrorActionPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & gcloud.cmd @Arguments
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }

    if ($exitCode -ne 0) {
        throw "gcloud failed with exit code $exitCode."
    }
}

function Quote-Yaml([string]$Value) {
    return "'" + $Value.Replace("'", "''") + "'"
}

$environmentPath = Join-Path $PSScriptRoot '.env'
if (-not (Test-Path $environmentPath)) {
    throw 'Missing .env. Copy .env.example to .env and configure it before deploying.'
}

$environment = Read-DotEnv $environmentPath
$required = @(
    'GOOGLE_WALLET_ISSUER_ID',
    'APPLE_PASS_TYPE_IDENTIFIER',
    'APPLE_TEAM_IDENTIFIER',
    'APPLE_ORGANIZATION_NAME'
)

foreach ($name in $required) {
    if (-not $environment.ContainsKey($name) -or [string]::IsNullOrWhiteSpace($environment[$name])) {
        throw "Missing required environment variable: $name"
    }
}

if ($environment['GOOGLE_WALLET_ISSUER_ID'] -notmatch '^[0-9]{19}$') {
    throw 'GOOGLE_WALLET_ISSUER_ID must contain exactly 19 ASCII digits.'
}

if ($PublicBaseUrl -notmatch '^https://') {
    throw 'PublicBaseUrl must be an HTTPS URL.'
}

$env:CLOUDSDK_METRICS_ENVIRONMENT = (($env:CLOUDSDK_METRICS_ENVIRONMENT + ' datacloud.vscode').Trim())
$repository = "$Region-docker.pkg.dev/$ProjectId/cloud-run-source-deploy/$Service"
$tag = "$repository`:$([DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))"
$environmentFile = Join-Path ([IO.Path]::GetTempPath()) "rotary-wallet-$([guid]::NewGuid().ToString('N')).yaml"

try {
    $environmentLines = @(
        "GOOGLE_WALLET_ISSUER_ID: $(Quote-Yaml $environment['GOOGLE_WALLET_ISSUER_ID'])"
        "APPLE_PASS_TYPE_IDENTIFIER: $(Quote-Yaml $environment['APPLE_PASS_TYPE_IDENTIFIER'])"
        "APPLE_TEAM_IDENTIFIER: $(Quote-Yaml $environment['APPLE_TEAM_IDENTIFIER'])"
        "APPLE_ORGANIZATION_NAME: $(Quote-Yaml $environment['APPLE_ORGANIZATION_NAME'])"
        "PUBLIC_BASE_URL: $(Quote-Yaml $PublicBaseUrl)"
        "APPLE_SIGNER_CERT_PATH: '/secrets/pass-cert/passcert.pem'"
        "APPLE_SIGNER_KEY_PATH: '/secrets/pass-key/passkey.pem'"
        "APPLE_WWDR_CERT_PATH: '/secrets/wwdr/wwdr.pem'"
        "CREATOR_ACCESS_CODE_PATH: '/secrets/creator-access/code'"
        "SESSION_SECRET_PATH: '/secrets/session-secret/key'"
    )

    if ($environment.ContainsKey('INSTALLS_SCHEDULER_SA_EMAIL') -and -not [string]::IsNullOrWhiteSpace($environment['INSTALLS_SCHEDULER_SA_EMAIL'])) {
        $environmentLines += "INSTALLS_SCHEDULER_SA_EMAIL: $(Quote-Yaml $environment['INSTALLS_SCHEDULER_SA_EMAIL'])"
    }

    $environmentLines | Set-Content -Path $environmentFile -Encoding UTF8

    Invoke-Gcloud @('config', 'set', 'project', $ProjectId, '--quiet')
    Invoke-Gcloud @('builds', 'submit', $PSScriptRoot, '--tag', $tag, '--region', $Region, '--quiet')

    $digest = (& gcloud.cmd artifacts docker images describe $tag --project $ProjectId --format='value(image_summary.digest)' --quiet).Trim()
    if ($LASTEXITCODE -ne 0 -or $digest -notmatch '^sha256:[0-9a-f]{64}$') {
        throw 'Unable to resolve the built image digest.'
    }

    $image = "$repository@$digest"
    $secretMappings = '/secrets/pass-cert/passcert.pem=apple-pass-cert:latest,/secrets/pass-key/passkey.pem=apple-pass-key:latest,/secrets/wwdr/wwdr.pem=apple-wwdr-cert:latest,/secrets/creator-access/code=creator-access-code:latest,/secrets/session-secret/key=creator-session-secret:latest'
    Invoke-Gcloud @(
        'run', 'deploy', $Service,
        '--project', $ProjectId,
        '--region', $Region,
        '--image', $image,
        '--service-account', $ServiceAccountEmail,
        '--allow-unauthenticated',
        '--min-instances', '0',
        '--max-instances', '1',
        '--concurrency', '40',
        '--timeout', '60s',
        '--env-vars-file', $environmentFile,
        '--set-secrets', $secretMappings,
        '--quiet'
    )

    $serviceUrl = (& gcloud.cmd run services describe $Service --project $ProjectId --region $Region --format='value(status.url)' --quiet).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $serviceUrl) {
        throw 'Unable to resolve the deployed Cloud Run URL.'
    }

    $health = Invoke-RestMethod "$serviceUrl/api/health"
    if ($health.status -ne 'ok') {
        throw 'The deployed health check did not return status=ok.'
    }

    Write-Output "Deployed: $serviceUrl"
    Write-Output "Image: $image"
    Write-Output 'Health: ok'
}
finally {
    Remove-Item $environmentFile -Force -ErrorAction SilentlyContinue
}

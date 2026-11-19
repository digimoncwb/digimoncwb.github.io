param(
    [string]$DbUrl = $env:SUPABASE_DB_URL
)

$ErrorActionPreference = "Stop"

$script:SupabaseCmd = @("supabase")

function Resolve-SupabaseCommand {
    if (Get-Command "supabase" -ErrorAction SilentlyContinue) {
        return @("supabase")
    }
    if (Get-Command "npx.cmd" -ErrorAction SilentlyContinue) {
        return @("npx.cmd", "-y", "supabase@latest")
    }
    if (Get-Command "npx" -ErrorAction SilentlyContinue) {
        return @("npx", "-y", "supabase@latest")
    }
    throw "Supabase CLI not found and 'npx' is unavailable. Install Supabase CLI first: https://supabase.com/docs/guides/cli"
}

function Test-CommandExists {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-DockerAvailable {
    if (Test-CommandExists "docker") {
        return $true
    }

    $dockerDefaultPath = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
    if (Test-Path $dockerDefaultPath) {
        $env:PATH = "$($env:PATH);C:\Program Files\Docker\Docker\resources\bin"
        return $true
    }

    return $false
}

function Run-Step {
    param(
        [string]$Label,
        [scriptblock]$Action
    )
    Write-Host "==> $Label"
    & $Action
    if ($LASTEXITCODE -ne 0) {
        throw "Step failed: $Label"
    }
}

# @() keeps a one-item result as an array; otherwise [0] would read the first character.
$script:SupabaseCmd = @(Resolve-SupabaseCommand)

if (-not (Test-DockerAvailable)) {
    throw "Docker CLI not found. 'supabase db dump' requires Docker Desktop. Install Docker Desktop (or run this script in an environment with Docker)."
}

function Invoke-Supabase {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$CliArgs)
    $exe = $script:SupabaseCmd[0]
    $base = @()
    if ($script:SupabaseCmd.Length -gt 1) {
        $base = $script:SupabaseCmd[1..($script:SupabaseCmd.Length - 1)]
    }
    & $exe @base @CliArgs
}

if ([string]::IsNullOrWhiteSpace($DbUrl)) {
    throw "SUPABASE_DB_URL is not set. Define it before running this script."
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$snapshotDir = Join-Path $projectRoot "database/snapshots"
New-Item -ItemType Directory -Path $snapshotDir -Force | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$schemaSnapshot = Join-Path $snapshotDir "schema-$stamp.sql"
$rolesSnapshot = Join-Path $snapshotDir "roles-$stamp.sql"
$latestSchema = Join-Path $projectRoot "database/schema.latest.sql"
$latestRoles = Join-Path $projectRoot "database/roles.latest.sql"

Run-Step "Dumping schema (public)" {
    Invoke-Supabase db dump --db-url $DbUrl --schema public --file $schemaSnapshot
}

Run-Step "Dumping roles" {
    Invoke-Supabase db dump --db-url $DbUrl --role-only --file $rolesSnapshot
}

Copy-Item -Path $schemaSnapshot -Destination $latestSchema -Force
Copy-Item -Path $rolesSnapshot -Destination $latestRoles -Force

$supabaseConfig = Join-Path $projectRoot "supabase/config.toml"
if (Test-Path $supabaseConfig) {
    try {
        Run-Step "Pulling remote schema as migration (supabase db pull)" {
            Invoke-Supabase db pull
        }
    } catch {
        Write-Warning "Could not run 'supabase db pull'. Keep snapshots and run pull manually after linking/login."
    }
} else {
    Write-Warning "No supabase/config.toml found. Run 'supabase init' and 'supabase link' to enable migrations via db pull."
}

Write-Host ""
Write-Host "Snapshots generated:"
Write-Host " - $schemaSnapshot"
Write-Host " - $rolesSnapshot"
Write-Host "Updated:"
Write-Host " - $latestSchema"
Write-Host " - $latestRoles"

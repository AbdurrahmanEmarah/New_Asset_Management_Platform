<#
.SYNOPSIS
  Checks that Azure and GitHub are set up for the deploy workflow (.github/workflows/deploy.yml).
  Prints "Ready to deploy" or exactly what is missing and how to fix it. Changes nothing.

.EXAMPLE
  cd C:\path\to\New_Asset_Management_Platform
  powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1

.NOTES
  Needs the Azure CLI (az login) and the GitHub CLI (gh auth login).
  Works in Windows PowerShell 5.1 and PowerShell 7. The bash version is scripts/preflight.sh; keep the two in step.
#>
param(
    [string]$Repo = '',
    [string]$Environment = 'staging'
)

$ErrorActionPreference = 'Continue'
$script:Problems = New-Object System.Collections.Generic.List[string]

function Ok([string]$What) { Write-Host "  [ok]      $What" -ForegroundColor Green }
function Missing([string]$What, [string]$Fix) {
    Write-Host "  [missing] $What" -ForegroundColor Red
    Write-Host "            -> $Fix"
    $script:Problems.Add($What)
}
function Info([string]$What) { Write-Host "  [info]    $What" -ForegroundColor Yellow }
function Section([string]$Name) { Write-Host ""; Write-Host $Name -ForegroundColor Cyan }
function Has([string]$Command) { [bool](Get-Command $Command -ErrorAction SilentlyContinue) }
# Runs a native command and returns its trimmed output, or '' when it fails.
function Run([scriptblock]$Command) {
    $output = & $Command 2>$null
    if ($LASTEXITCODE -ne 0) { return '' }
    if ($null -eq $output) { return '' }
    return (($output | Out-String).Trim())
}

$providers = @('Microsoft.App', 'Microsoft.ContainerRegistry', 'Microsoft.DBforPostgreSQL', 'Microsoft.KeyVault',
    'Microsoft.ManagedIdentity', 'Microsoft.Network', 'Microsoft.OperationalInsights', 'Microsoft.Insights',
    'Microsoft.ServiceBus', 'Microsoft.Storage', 'Microsoft.Web')
$requiredVars = @('AZURE_CLIENT_ID', 'AZURE_TENANT_ID', 'AZURE_SUBSCRIPTION_ID', 'AZURE_RESOURCE_GROUP', 'AZURE_LOCATION',
    'INVENTRA_NAME_PREFIX', 'INVENTRA_PLATFORM_AUTHORITY')
$vars = @{}

# --- GitHub ---
Section 'GitHub'
if (-not (Has 'gh')) {
    Missing 'GitHub CLI (gh)' 'Install it: winget install --id GitHub.cli   then run: gh auth login'
}
else {
    gh auth status 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Missing 'Signed in to the GitHub CLI' 'Run: gh auth login'
    }
    else {
        Ok 'GitHub CLI signed in'
        if (-not $Repo) { $Repo = Run { gh repo view --json nameWithOwner -q .nameWithOwner } }
        if (-not $Repo) {
            Missing 'Repository' 'Run this from the repository folder, or pass -Repo owner/name'
        }
        else {
            Ok "Repository $Repo"
            $json = Run { gh variable list --repo $Repo --json 'name,value' }
            if ($json) { foreach ($v in ($json | ConvertFrom-Json)) { $vars[$v.name] = $v.value } }
            foreach ($name in $requiredVars) {
                if ($vars[$name]) { Ok "Variable $name = $($vars[$name])" }
                else { Missing "Repository variable $name" "gh variable set $name --repo $Repo --body `"<value>`"  (docs/deployment/azure-setup.md)" }
            }
            $envCheck = Run { gh api "repos/$Repo/environments/$Environment" }
            if ($envCheck) { Ok "Environment '$Environment'" }
            else { Missing "GitHub environment '$Environment'" "gh api -X PUT repos/$Repo/environments/$Environment" }
            if ($vars['DEPLOY_ENABLED'] -eq 'true') { Ok 'DEPLOY_ENABLED is true (deployments run after CI on main)' }
            else { Info 'DEPLOY_ENABLED is not "true", so the deploy workflow stays switched off.' }
        }
    }
}

# --- Sign-in and web apps ---
Section 'Sign-in and web apps'
# The services tell the realms apart by comparing a token's issuer with these values, so each must be
# exactly the issuer its metadata announces.
foreach ($realm in @('PLATFORM', 'TENANT')) {
    $authority = $vars["INVENTRA_${realm}_AUTHORITY"]
    if (-not $authority) {
        if ($realm -eq 'TENANT') { Info 'INVENTRA_TENANT_AUTHORITY is not set: client users cannot sign in yet, and the client app is not deployed.' }
        continue
    }
    $metadata = $authority.TrimEnd('/') + '/.well-known/openid-configuration'
    $issuer = ''
    try { $issuer = [string](Invoke-RestMethod -Uri $metadata -TimeoutSec 15 -UseBasicParsing).issuer } catch { $issuer = '' }
    if (-not $issuer) {
        Missing "Issuer metadata at $metadata" "Check INVENTRA_${realm}_AUTHORITY (docs/deployment/identity.md)"
    }
    elseif ($issuer.TrimEnd('/') -ne $authority.TrimEnd('/')) {
        Missing "INVENTRA_${realm}_AUTHORITY equals the issuer in its metadata" "gh variable set INVENTRA_${realm}_AUTHORITY --repo $Repo --body `"$issuer`""
    }
    else { Ok "INVENTRA_${realm}_AUTHORITY is the issuer: $issuer" }
    if ($authority -match 'microsoftonline\.com|ciamlogin\.com' -and -not $vars["INVENTRA_${realm}_AUDIENCE"]) {
        Missing "Repository variable INVENTRA_${realm}_AUDIENCE" "Set it to the client ID of the $($realm.ToLower()) API app registration (docs/deployment/identity.md)"
    }
}
foreach ($name in @('INVENTRA_WEB_ADMIN_CLIENT_ID', 'INVENTRA_WEB_CLIENT_CLIENT_ID', 'INVENTRA_WEB_SUPPORT_CLIENT_ID')) {
    if ($vars[$name]) { Ok "Variable $name = $($vars[$name])" }
    else { Info "$name is not set: the matching web app is skipped (or support sign-in is off)." }
}

# --- Azure ---
Section 'Azure'
$subscription = $vars['AZURE_SUBSCRIPTION_ID']
$rg = $vars['AZURE_RESOURCE_GROUP']
$location = $vars['AZURE_LOCATION']
$clientId = $vars['AZURE_CLIENT_ID']
$tenant = $vars['AZURE_TENANT_ID']

if (-not (Has 'az')) {
    Missing 'Azure CLI (az)' 'Install it: winget install --id Microsoft.AzureCLI   then open a new PowerShell and run: az login'
}
elseif (-not (Run { az account show })) {
    Missing 'Signed in to the Azure CLI' 'Run: az login'
}
elseif (-not $subscription) {
    Missing 'Subscription to check' 'Set the AZURE_SUBSCRIPTION_ID repository variable first'
}
else {
    $state = Run { az account show --subscription $subscription --query state -o tsv }
    if ($state -ne 'Enabled') {
        if (-not $state) { $state = 'not found' }
        Missing "Subscription $subscription (state: $state)" "Check the ID, or run: az login --tenant $tenant"
    }
    else {
        Ok "Subscription $subscription is enabled"
        $actualTenant = Run { az account show --subscription $subscription --query tenantId -o tsv }
        if ($tenant -and $actualTenant -ne $tenant) {
            Missing 'AZURE_TENANT_ID matches the subscription' "Set AZURE_TENANT_ID to $actualTenant"
        }

        $registered = (Run { az provider list --subscription $subscription --query "[?registrationState=='Registered'].namespace" -o tsv }) -split "`r?`n"
        foreach ($p in $providers) {
            if ($registered -contains $p) { Ok "Provider $p registered" }
            else { Missing "Resource provider $p" "az provider register --namespace $p --subscription $subscription" }
        }

        $rgId = ''
        if ($rg) {
            $rgLocation = Run { az group show --subscription $subscription -n $rg --query location -o tsv }
            if (-not $rgLocation) {
                $where = if ($location) { $location } else { '<region>' }
                Missing "Resource group $rg" "az group create --name $rg --location $where --subscription $subscription"
            }
            else {
                Ok "Resource group $rg ($rgLocation)"
                $rgId = Run { az group show --subscription $subscription -n $rg --query id -o tsv }
                if ($location -and $rgLocation -ne $location) {
                    Missing "AZURE_LOCATION ($location) matches the resource group's region ($rgLocation)" "Set AZURE_LOCATION to $rgLocation"
                }
            }
        }

        if ($clientId) {
            $identityJson = Run { az identity list --subscription $subscription --query "[?clientId=='$clientId'] | [0]" -o json }
            $identity = $null
            if ($identityJson -and $identityJson -ne 'null') { $identity = $identityJson | ConvertFrom-Json }
            if (-not $identity) {
                Missing "Deploy identity with client ID $clientId" 'Create it as in docs/deployment/azure-setup.md, step 4'
            }
            else {
                Ok "Deploy identity $($identity.name)"
                $subject = "repo:${Repo}:environment:$Environment"
                $found = Run { az identity federated-credential list --subscription $subscription --identity-name $identity.name -g $identity.resourceGroup --query "[?subject=='$subject' && issuer=='https://token.actions.githubusercontent.com'] | length(@)" -o tsv }
                if ([int]("0$found") -ge 1) { Ok "Federated credential for $subject" }
                else { Missing "Federated credential for $subject" "az identity federated-credential create --identity-name $($identity.name) -g $($identity.resourceGroup) --name github-$Environment --issuer https://token.actions.githubusercontent.com --subject $subject --audiences api://AzureADTokenExchange" }

                if ($rgId) {
                    $roles = (Run { az role assignment list --subscription $subscription --assignee $identity.principalId --scope $rgId --include-inherited --query "[].roleDefinitionName" -o tsv }) -split "`r?`n"
                    if ($roles -contains 'Contributor' -or $roles -contains 'Owner') { Ok "Deploy identity can create resources in $rg" }
                    else { Missing "Contributor role for the deploy identity on $rg" "az role assignment create --assignee-object-id $($identity.principalId) --assignee-principal-type ServicePrincipal --role Contributor --scope $rgId" }
                    if ($roles -contains 'Role Based Access Control Administrator' -or $roles -contains 'User Access Administrator' -or $roles -contains 'Owner') { Ok 'Deploy identity can grant the apps their roles' }
                    else { Missing "Role Based Access Control Administrator role for the deploy identity on $rg" 'See docs/deployment/azure-setup.md, step 5 (limited to the roles the apps need)' }
                }
            }
        }
    }
}

Write-Host ""
if ($script:Problems.Count -eq 0) {
    Write-Host 'Ready to deploy' -ForegroundColor Green
    if ($vars['DEPLOY_ENABLED'] -ne 'true') { Write-Host "(Switch it on with: gh variable set DEPLOY_ENABLED --repo $Repo --body true)" }
    exit 0
}
Write-Host "Not ready: $($script:Problems.Count) thing(s) missing:" -ForegroundColor Red
foreach ($p in $script:Problems) { Write-Host "  - $p" }
exit 1

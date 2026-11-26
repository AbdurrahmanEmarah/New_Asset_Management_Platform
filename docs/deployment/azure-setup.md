# Azure setup for deployments (staging)

These steps prepare Azure and GitHub so that `.github/workflows/deploy.yml` can deploy the staging environment. They take about 20 minutes. You run them once in Windows PowerShell. Deployments stay switched off until the last step.

The pipeline needs **no secrets in GitHub**. It signs in to Azure with OpenID Connect: GitHub proves "I am this repository, running in the `staging` environment", and Azure trusts exactly that. The deploy workflow generates the database passwords itself and keeps them in Key Vault.

> Copy each block into PowerShell as it is. Lines that start with `#` are comments.

## 1. Install the tools and open the repository

```powershell
winget install --id Microsoft.AzureCLI
winget install --id GitHub.cli
# Close PowerShell and open a new window so the new commands are found, then:
cd C:\path\to\New_Asset_Management_Platform
az login
gh auth login
```

## 2. Choose the names

Change the values in quotes if you want to. The region must offer Azure Container Apps and PostgreSQL Flexible Server, which `westeurope`, `northeurope`, `uksouth` and `eastus` all do.

```powershell
$sub      = (az account show --query id -o tsv)      # or paste a subscription ID
$tenant   = (az account show --query tenantId -o tsv)
$location = "westeurope"
$rg       = "inventra-staging-rg"
$prefix   = "inventra"                               # 2-8 lowercase letters or digits
$repo     = (gh repo view --json nameWithOwner -q .nameWithOwner)
az account set --subscription $sub
"Subscription $sub, tenant $tenant, $location, $rg, repo $repo"
```

If the last line shows the wrong subscription, run `az account list -o table` and set `$sub` yourself.

## 3. Register the resource providers and create the resource group

A new subscription has to switch these services on once. It is free.

```powershell
$providers = "Microsoft.App","Microsoft.ContainerRegistry","Microsoft.DBforPostgreSQL","Microsoft.KeyVault",
             "Microsoft.ManagedIdentity","Microsoft.Network","Microsoft.OperationalInsights","Microsoft.Insights",
             "Microsoft.ServiceBus","Microsoft.Storage","Microsoft.Web"
foreach ($p in $providers) { az provider register --namespace $p --subscription $sub }
az group create --name $rg --location $location --tags app=inventra environment=staging
```

Registration can take a few minutes. The preflight check in step 8 tells you if one is still pending.

## 4. Create the deploy identity and trust GitHub

The deploy identity is a managed identity that only the GitHub `staging` environment of this repository can sign in as.

```powershell
az identity create --name "$prefix-staging-deploy" --resource-group $rg --location $location
$clientId    = (az identity show --name "$prefix-staging-deploy" --resource-group $rg --query clientId -o tsv)
$principalId = (az identity show --name "$prefix-staging-deploy" --resource-group $rg --query principalId -o tsv)

az identity federated-credential create `
  --identity-name "$prefix-staging-deploy" --resource-group $rg `
  --name github-staging `
  --issuer https://token.actions.githubusercontent.com `
  --subject "repo:${repo}:environment:staging" `
  --audiences api://AzureADTokenExchange
```

## 5. Give the deploy identity its roles on the resource group

* **Contributor** lets it create and update resources in this resource group only.
* **Role Based Access Control Administrator** lets it give each app its own narrow roles. A condition limits it to these roles: pull or push images, read Key Vault secrets, send and receive on Service Bus, and read and write blobs. It can't make anyone an Owner or Contributor.

```powershell
$scope = (az group show --name $rg --query id -o tsv)
az role assignment create --assignee-object-id $principalId --assignee-principal-type ServicePrincipal `
  --role Contributor --scope $scope

# AcrPull, AcrPush, Key Vault Secrets User, Service Bus Data Sender, Service Bus Data Receiver, Storage Blob Data Contributor
$allowed = "7f951dda-4ed3-4680-a7ca-43fe172d538d, 8311e382-0749-4cb8-b61a-304f252e45ec, 4633458b-17de-408a-b874-0445c86b69e6, 69a216fc-b8fb-44d8-bc22-1f3c2cd27a39, 4f6d3b9b-027b-4f4c-9142-0e5a2a2247e0, ba92f5b4-2d11-453d-a403-e96b0029c9fe"
$condition = "((!(ActionMatches{'Microsoft.Authorization/roleAssignments/write'})) OR (@Request[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {$allowed})) AND ((!(ActionMatches{'Microsoft.Authorization/roleAssignments/delete'})) OR (@Resource[Microsoft.Authorization/roleAssignments:RoleDefinitionId] ForAnyOfAnyValues:GuidEquals {$allowed}))"
az role assignment create --assignee-object-id $principalId --assignee-principal-type ServicePrincipal `
  --role "Role Based Access Control Administrator" --scope $scope `
  --condition $condition --condition-version "2.0"
```

If the second command fails with a quoting error in Windows PowerShell 5.1, run the same lines in PowerShell 7 (`winget install --id Microsoft.PowerShell`, then `pwsh`). As a last resort you can drop `--condition` and `--condition-version`. That works, but the identity is then allowed to grant any role in this resource group.

## 6. Create the GitHub environment and the variables

All of these are **variables**, not secrets. None of them is a password.

```powershell
gh api -X PUT "repos/$repo/environments/staging" `
  -F "deployment_branch_policy[protected_branches]=false" `
  -F "deployment_branch_policy[custom_branch_policies]=true"
gh api -X POST "repos/$repo/environments/staging/deployment-branch-policies" -f name=main

gh variable set AZURE_CLIENT_ID       --repo $repo --body $clientId
gh variable set AZURE_TENANT_ID       --repo $repo --body $tenant
gh variable set AZURE_SUBSCRIPTION_ID --repo $repo --body $sub
gh variable set AZURE_RESOURCE_GROUP  --repo $repo --body $rg
gh variable set AZURE_LOCATION        --repo $repo --body $location
gh variable set INVENTRA_NAME_PREFIX  --repo $repo --body $prefix
gh variable set DEPLOY_ENABLED        --repo $repo --body false
```

The branch policy means only `main` can deploy to staging.

## 7. Sign-in and web apps

Create the sign-in tenants and app registrations as described in [identity.md](identity.md). Then set the IDs it gives you. None of them is secret.

```powershell
gh variable set INVENTRA_PLATFORM_AUTHORITY    --repo $repo --body "https://login.microsoftonline.com/<staff tenant ID>/v2.0"
gh variable set INVENTRA_PLATFORM_AUDIENCE     --repo $repo --body "<platform API client ID>"
gh variable set INVENTRA_TENANT_AUTHORITY      --repo $repo --body "https://<client tenant ID>.ciamlogin.com/<client tenant ID>/v2.0"
gh variable set INVENTRA_TENANT_AUDIENCE       --repo $repo --body "<client API client ID>"
gh variable set INVENTRA_WEB_ADMIN_CLIENT_ID   --repo $repo --body "<admin console client ID>"
gh variable set INVENTRA_WEB_ADMIN_SCOPE       --repo $repo --body "openid profile email api://<platform API client ID>/access"
gh variable set INVENTRA_WEB_CLIENT_CLIENT_ID  --repo $repo --body "<client web app client ID>"
gh variable set INVENTRA_WEB_CLIENT_SCOPE      --repo $repo --body "openid profile email api://<client API client ID>/access"
gh variable set INVENTRA_WEB_SUPPORT_CLIENT_ID --repo $repo --body "<support-web client ID>"
```

The web apps are hosted on Azure Static Web Apps (Free, $0). After the first deployment, the workflow summary lists their addresses, for example `https://<name>.azurestaticapps.net`. Add `<address>/auth/callback` as a redirect URI on each app registration (identity.md, step 5). The gateway and Blob Storage accept requests from those addresses automatically. For a custom domain, add it with `INVENTRA_CORS_ORIGINS` (comma-separated). A web app is skipped until its client ID is set.

## 8. Check everything

```powershell
powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1
```

It prints **Ready to deploy**, or a list of what is missing with the command that fixes each item. It changes nothing, so you can run it as often as you like.

## 9. Switch deployments on (only when agreed)

```powershell
gh variable set DEPLOY_ENABLED --repo $repo --body true
```

From then on, every push to `main` that passes CI deploys to staging. You can also run it by hand: GitHub → Actions → Deploy → Run workflow. The first run takes about 30–40 minutes, most of it PostgreSQL being created. Later runs take about 10 minutes. Set the variable back to `false` to switch deployments off again.

## Rough monthly cost (staging)

The figures are pay-as-you-go list prices in USD for West Europe, as of late 2026. Check the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/) for your region.

| Resource | Size | About |
|---|---|---|
| PostgreSQL Flexible Server | Burstable B1ms, 32 GiB storage, 7-day backups | $17 |
| Private endpoints | Key Vault + Blob Storage, 2 × $7.30 | $15 |
| Service Bus | Standard | $10 |
| Container Registry | Basic | $5 |
| Log Analytics + Application Insights | Pay per GB, 1 GB/day cap; first 5 GB/month free | $0–15 |
| Container Apps | Consumption, scale to zero; monthly free grant covers light use | $0–10 |
| Private DNS zones | 3 × $0.50 | $1.50 |
| Key Vault, Blob Storage, VNet, managed identities | Pennies, or free | $1 |
| **Total** | | **about $50–75 a month** |

What would push it up: keeping apps always on (`minReplicas` 1 costs about $10–15 per app each month), a lot of logging, or upgrading Service Bus to Premium for private networking (about $680 a month). Production sizes are in `infra/main.bicep` (`sizes.production`).

To stop all costs, delete the resource group with `az group delete --name $rg`. The Key Vault name stays reserved for 7 days. To reuse it sooner, purge it with `az keyvault purge --name <vault name>`.

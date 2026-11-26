# Sign-in in Azure (Entra)

Locally, Keycloak provides both sign-in realms. In Azure, two Microsoft Entra tenants take their place. This page shows the owner how to create them and their app registrations, with PowerShell, or the [Entra admin center](https://entra.microsoft.com) where no command exists. It also records which token claims the services rely on.

> These steps follow Microsoft's documentation and have not yet been run against a live tenant. Run `scripts\preflight.ps1` afterwards. It checks each issuer, audience and client ID that the deploy workflow uses.

## Keycloak locally, Entra in Azure

| Locally (Keycloak, port 18080) | In Azure | Why |
|---|---|---|
| Realm `inventra-platform` (staff) | **The staff tenant**: your existing Microsoft Entra ID tenant, the one your Azure subscription belongs to | Staff are your own people. They get MFA and Conditional Access, and the tenant is free. |
| Realm `inventra` (client users) | **The client tenant**: a new Entra **External ID** tenant | Built for customers: self-service sign-in, branding. The first 50,000 monthly active users are free. |
| Client `admin-console` (staff realm) | App registration "Inventra Admin Console" (single-page app) | |
| Client `support-web` (staff realm) | App registration "Inventra Support Web" (single-page app, on the client app's address) | Support staff open a client's workspace on a support pass. |
| Client `web-app` (client realm) | App registration "Inventra Client Web" (single-page app) | |
| Client `field-app` (client realm) | App registration "Inventra Field App" (mobile; `inventra://auth/callback`) | |
| Audience mapper `inventra-api` | App registration "Inventra Platform API" / "Inventra Client API". **The audience becomes the API's client ID.** | Entra v2 access tokens carry the API's client ID as `aud`. |
| Realm roles `platform-owner`, `platform-support`, `platform-billing` | **App roles** on "Inventra Platform API", assigned to staff | They arrive in the `roles` claim. |
| User attribute `tenant_id` + mapper | A **directory extension attribute** `tenantId`, emitted as `tenant_id` by a claims mapping policy | The Access service sets it when someone accepts an invitation. |
| Confidential client `access-service` (writes `tenant_id`, enables and disables users) | App registration "Inventra Access Directory" with Microsoft Graph permission `User.ReadWrite.All`, which trusts the Access service's managed identity (no secret) | |

The two tenants have different issuers. That is exactly how the services tell the realms apart: a token whose issuer equals `Auth:Tenant:Authority` is a client token, and everything else is checked as a staff token. The server stamps the realm itself (`inventra:realm`) and never reads it from the token.

## Claims the services rely on

| Claim | Used for | Staff tenant | Client tenant |
|---|---|---|---|
| `iss` | Choosing the realm | `https://login.microsoftonline.com/<tenant ID>/v2.0` | `https://<tenant ID>.ciamlogin.com/<tenant ID>/v2.0` |
| `aud` | Rejecting tokens for other apps | Platform API client ID | Client API client ID |
| `sub` | The user's ID (audit, links to users) | Present. **See the caution below.** | Present. **See the caution below.** |
| `name`, `email` | Display name, notifications | `name` with the `profile` scope. `email` is an optional claim (step 2). | Same |
| `roles` | Platform policies (`platform-owner` and others) | App role assignments | Not used: client permissions live in the Access service |
| `tenant_id` | The client a user belongs to (row-level security) | Not present (staff) | Claims mapping policy (step 7) |

**Caution about `sub`:** in Entra, `sub` is *pairwise*: it differs per application, and Microsoft Graph doesn't know it. The stable ID of a person in a tenant is `oid`. The Access service needs the Graph object ID to set `tenant_id` and to enable or disable sign-in. **Before go-live, the code should use `oid` when it is present** (a small change in `BuildingBlocks` `CurrentUser` and in the Access service). This is listed for the backend team.

## Before you start

```powershell
cd C:\path\to\New_Asset_Management_Platform
$repo = (gh repo view --json nameWithOwner -q .nameWithOwner)
# The web apps' addresses, from the first deployment's summary (or: az staticwebapp list -g <rg> -o table)
$adminUrl  = "https://<admin site>.azurestaticapps.net"
$clientUrl = "https://<client site>.azurestaticapps.net"
```

Every Graph call below sends a JSON file, which avoids quoting problems in Windows PowerShell. `az rest` sends the request to the tenant you are signed in to.

## Staff tenant

### 1. Sign in to the staff tenant

```powershell
az login
$staffTenant = (az account show --query tenantId -o tsv)
```

### 2. Platform API (audience, scope and app roles)

```powershell
$roles = @(
  @{ value = "platform-owner";   displayName = "Platform owner";   description = "Everything, including clients and plans" },
  @{ value = "platform-support"; displayName = "Platform support"; description = "Read, and support passes" },
  @{ value = "platform-billing"; displayName = "Platform billing"; description = "Read, and change plans" }
) | ForEach-Object { @{ id = [guid]::NewGuid(); allowedMemberTypes = @("User"); isEnabled = $true } + $_ }
@{
  displayName = "Inventra Platform API"
  signInAudience = "AzureADMyOrg"
  appRoles = $roles
  api = @{
    requestedAccessTokenVersion = 2
    oauth2PermissionScopes = @(@{ id = [guid]::NewGuid(); value = "access"; type = "User"; isEnabled = $true
      adminConsentDisplayName = "Use Inventra"; adminConsentDescription = "Call the Inventra API as the signed-in user" })
  }
  optionalClaims = @{ accessToken = @(@{ name = "email"; essential = $false }) }
} | ConvertTo-Json -Depth 10 | Set-Content platform-api.json
$platformApi = az rest --method POST --url https://graph.microsoft.com/v1.0/applications --body "@platform-api.json" | ConvertFrom-Json
az rest --method PATCH --url "https://graph.microsoft.com/v1.0/applications/$($platformApi.id)" --body "{\`"identifierUris\`":[\`"api://$($platformApi.appId)\`"]}"
az ad sp create --id $platformApi.appId
"Platform API client ID: $($platformApi.appId)"
```

If the escaped PATCH line gives trouble in Windows PowerShell 5.1, set the Application ID URI in the portal instead: App registrations → Inventra Platform API → Expose an API → Application ID URI → **Add** (accept `api://<client ID>`).

### 3. Admin console and support web (single-page apps)

```powershell
function New-Spa($name, $redirects, $apiApp) {
  $scopeId = ($apiApp.api.oauth2PermissionScopes | Where-Object value -eq "access").id
  @{
    displayName = $name
    signInAudience = "AzureADMyOrg"
    spa = @{ redirectUris = $redirects }
    requiredResourceAccess = @(@{ resourceAppId = $apiApp.appId; resourceAccess = @(@{ id = $scopeId; type = "Scope" }) })
  } | ConvertTo-Json -Depth 10 | Set-Content spa.json
  $app = az rest --method POST --url https://graph.microsoft.com/v1.0/applications --body "@spa.json" | ConvertFrom-Json
  az ad sp create --id $app.appId | Out-Null
  az ad app permission admin-consent --id $app.appId
  return $app
}
$admin   = New-Spa "Inventra Admin Console" @("$adminUrl/auth/callback")  $platformApi
$support = New-Spa "Inventra Support Web"   @("$clientUrl/auth/callback") $platformApi
"Admin console client ID: $($admin.appId)  Support web client ID: $($support.appId)"
```

### 4. Give staff their roles

In the Entra admin center: Enterprise applications → **Inventra Platform API** → Properties → set *Assignment required* to **Yes**. Then Users and groups → **Add user/group**, pick a person and pick a role. Assigning roles to groups needs Entra ID P1. Assigning to individual users is free.

## Client tenant (External ID)

### 5. Create the tenant

In the Entra admin center: Overview → Manage tenants → **Create** → **External**. Choose a name, a domain (`<name>.onmicrosoft.com`) and the same region as staging, and link it to your subscription. Then sign in to it:

```powershell
$clientTenant = "<the new tenant ID>"
az login --tenant $clientTenant --allow-no-subscriptions
```

### 6. Client API, client web and field app

Run steps 2 and 3 again, with these changes:

* Name the API **"Inventra Client API"**, leave out `appRoles`, and add `acceptMappedClaims = $true` under `api`. Step 7 needs it.
* Create the web app with `New-Spa "Inventra Client Web" @("$clientUrl/auth/callback") $clientApi`.
* Create the field app as a mobile/public client: in the portal, App registrations → New → "Inventra Field App" → Authentication → Add a platform → **Mobile and desktop applications** → custom redirect URI `inventra://auth/callback`. Add `exp://` only while testing with Expo Go. Then API permissions → Add → My APIs → Inventra Client API → `access` → Grant admin consent.

Then create a sign-in user flow: External Identities → User flows → **New user flow**, with email + password or an email one-time passcode. Collect **Display name**, and add the Client Web and Field App applications to it. Inventra invites client users. If you don't want people to sign up on their own, ask the Lead how invitations should work before you open the flow.

### 7. The `tenant_id` claim

The Access service writes each person's client into a directory extension attribute. A claims mapping policy then puts it in the Client API's access tokens as `tenant_id`.

```powershell
# a) The app that owns the attribute and that the Access service uses to call Graph.
@{ displayName = "Inventra Access Directory"; signInAudience = "AzureADMyOrg" } | ConvertTo-Json | Set-Content dir.json
$dir = az rest --method POST --url https://graph.microsoft.com/v1.0/applications --body "@dir.json" | ConvertFrom-Json
az ad sp create --id $dir.appId | Out-Null

# b) The attribute: extension_<appId without dashes>_tenantId
@{ name = "tenantId"; dataType = "String"; targetObjects = @("User") } | ConvertTo-Json | Set-Content ext.json
$ext = az rest --method POST --url "https://graph.microsoft.com/v1.0/applications/$($dir.id)/extensionProperties" --body "@ext.json" | ConvertFrom-Json
"Attribute: $($ext.name)"

# c) The claims mapping policy, assigned to the Client API's service principal.
$definition = @{ ClaimsMappingPolicy = @{ Version = 1; IncludeBasicClaimSet = "true"
  ClaimsSchema = @(@{ Source = "user"; ExtensionID = $ext.name; JwtClaimType = "tenant_id" }) } } | ConvertTo-Json -Depth 10 -Compress
@{ displayName = "Inventra tenant_id"; isOrganizationDefault = $false; definition = @($definition) } | ConvertTo-Json -Depth 10 | Set-Content policy.json
$policy = az rest --method POST --url https://graph.microsoft.com/v1.0/policies/claimsMappingPolicies --body "@policy.json" | ConvertFrom-Json
$clientApiSp = az ad sp show --id $clientApi.appId | ConvertFrom-Json
@{ "@odata.id" = "https://graph.microsoft.com/v1.0/policies/claimsMappingPolicies/$($policy.id)" } | ConvertTo-Json | Set-Content ref.json
az rest --method POST --url "https://graph.microsoft.com/v1.0/servicePrincipals/$($clientApiSp.id)/claimsMappingPolicies/`$ref" --body "@ref.json"
```

Then give "Inventra Access Directory" the Microsoft Graph **application** permission `User.ReadWrite.All` and grant admin consent (portal: API permissions). Under Certificates & secrets → **Federated credentials**, add one for the Access service's managed identity (`<prefix>-stg-access-id` in the staging resource group):

* Scenario: *Other issuer*
* Issuer: `https://login.microsoftonline.com/<staff tenant ID>/v2.0`
* Subject: that identity's **object (principal) ID**
* Audience: `api://AzureADTokenExchange`

With this credential the Access service needs no client secret. The Graph implementation of its `IIdentityDirectory` is still to be written (backend). Until then, linking users in Azure fails with a clear message.

## 8. Tell GitHub

Use the IDs from the steps above in [azure-setup.md, step 7](azure-setup.md#7-sign-in-and-web-apps). In short:

| Variable | Value |
|---|---|
| `INVENTRA_PLATFORM_AUTHORITY` | `https://login.microsoftonline.com/<staff tenant ID>/v2.0` |
| `INVENTRA_PLATFORM_AUDIENCE` | Platform API client ID |
| `INVENTRA_TENANT_AUTHORITY` | `https://<client tenant ID>.ciamlogin.com/<client tenant ID>/v2.0`. Use this form exactly, because it is the token issuer. The `<name>.ciamlogin.com` address also works for sign-in, but it doesn't match the issuer. |
| `INVENTRA_TENANT_AUDIENCE` | Client API client ID |
| `INVENTRA_WEB_ADMIN_CLIENT_ID`, `INVENTRA_WEB_SUPPORT_CLIENT_ID` | From step 3 |
| `INVENTRA_WEB_CLIENT_CLIENT_ID` | From step 6 |
| `INVENTRA_WEB_ADMIN_SCOPE` / `INVENTRA_WEB_CLIENT_SCOPE` | `openid profile email api://<API client ID>/access` |

`scripts\preflight.ps1` checks that each authority is exactly the issuer its metadata announces, that each Entra authority has an audience, and which web apps have client IDs.

## Still to do in code (not owner steps)

* **Web:** `shared/auth/AuthProvider.tsx` always asks for `openid profile email`. Entra only issues a token for the API when the API's scope is requested, so the scope must come from `VITE_OIDC_SCOPE`. The deploy workflow already sets it.
* **Backend:** use `oid` as the user ID when present (see the caution above), and add a Microsoft Graph `IIdentityDirectory` for the Access service.

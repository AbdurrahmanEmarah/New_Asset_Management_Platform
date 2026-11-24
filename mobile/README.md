# Inventra Field (mobile app)

The technicians' app: my jobs, job checklist and readings, complete a job, and scan an asset's QR tag. Built with Expo (SDK 58), Expo Router and TypeScript.

For now the screens run on **sample data** (`src/api/mock.ts`) behind one API module (`src/api/index.ts`), ready to switch to the Work Orders API in phase 3.

## Run it on your PC (Windows PowerShell)

You need Node.js 22 or newer.

```powershell
cd C:\path\to\New_Asset_Management_Platform\mobile
npm.cmd install
npx.cmd expo start --web
```

The app opens at http://localhost:8081. Without sign-in settings it says what is missing; press **Use sample data (development only)** to look around.

## Run it on your phone (Expo Go)

1. Install **Expo Go** from the App Store or Google Play.
2. Put the phone on the same Wi-Fi as the PC.
3. On the PC:

   ```powershell
   cd C:\path\to\New_Asset_Management_Platform\mobile
   npx.cmd expo start
   ```

4. Scan the QR code in the terminal: with the Camera app on iPhone, or from inside Expo Go on Android.

If the phone can't connect (company Wi-Fi often blocks it), run `npx.cmd expo start --tunnel` instead. If Windows Firewall asks, allow Node.js on private networks.

## Sign-in (Keycloak)

The app signs in to the Keycloak realm `inventra` with the code flow and PKCE (no client secret).

1. Copy the settings file and fill it in:

   ```powershell
   Copy-Item .env.example .env.local
   notepad .env.local
   ```

   | Setting | Example |
   |---|---|
   | `EXPO_PUBLIC_AUTH_ISSUER` | `http://localhost:18080/realms/inventra` |
   | `EXPO_PUBLIC_AUTH_CLIENT_ID` | `field-app` |

2. Restart `npx.cmd expo start` (Expo reads these when it starts).

The `field-app` client in Keycloak must be a **public** client with **Standard flow** on and these valid redirect URIs:

- `http://localhost:8081/*` (web)
- `inventra-field://*` (development builds)
- `exp://*` (Expo Go)

On a phone, `localhost` means the phone itself: use the PC's IP address in `EXPO_PUBLIC_AUTH_ISSUER` (for example `http://192.168.1.20:18080/realms/inventra`).

## Offline

Every change (ticking a step, typing a reading, completing a job) is saved on the phone first and sent in order. Without signal the app shows **"Offline: N changes saved on this phone"** and retries every 15 seconds. If the server refuses a change (for example the job was completed by someone else), the app shows the server's reason and carries on with the rest.

To try it, press the Wi-Fi icon on **My jobs**: the sample API then behaves as if there were no signal.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
```

## Layout

| Path | What |
|---|---|
| `app/` | Routes (Expo Router). Each file re-exports a screen from `src/screens`. |
| `src/api/` | The API types the app expects, and the sample implementation. |
| `src/offline/` | The offline queue (`queue.ts`) and its React provider. |
| `src/theme/` | Tokens (same names and values as `web/shared/theme/tokens.css`, checked by a test), System / Light / Dark. Dark (Control Room) is the default. |
| `src/ui/` | Shared parts: `Button` (with `disabledReason`), status pills, loading / error / empty states, the offline banner. |

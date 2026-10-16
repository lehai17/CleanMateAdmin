# CleanMate Admin

Independent admin/staff web application. This folder has its own Git repository
(branch `main`); no commit, GitHub repository or remote has been created.
It uses the shared API in `../backend`, not a separate database.

## Features and permissions

| Feature | Admin | Staff |
| --- | --- | --- |
| Dashboard and booking search | Yes | Yes |
| Review cleaner applications, request changes, reject with reason | Yes | Yes |
| View service catalog | Yes | Yes |
| Change service price, duration limits and availability | Yes | No |
| Create and lock/unlock Staff accounts | Yes | No |
| Audit history | All actions | Own actions |

Applicants remain customers until approved. Review results appear in their
notification inbox; rejected/needs-info applicants can update and resubmit.
Previously operating cleaners remain approved during the database upgrade.
Price changes affect new bookings; accepted booking quotes retain their price.
The customer must refresh a stale quote before submitting a new booking.

Dashboard totals are service value, not platform revenue. Customers pay cash
directly to cleaners after work. No money collection or payout is implemented.
Staff can now search and resolve booking support reports, with required resolution
text, version checks, audit and reporter notifications. Reports never change cash
records or bookings automatically. Document verification/upload and automatic job
assignment are not included in this version. See ../backend/PROJECT_STATUS.md.

## Run locally

Requires Node.js 22+, the shared .NET API and its configured database.
Back up the intended database before upgrading the API: startup applies the new
SQL Server or PostgreSQL management migration automatically.

From this folder:

```powershell
npm ci
$env:CLEANMATE_API_URL = 'http://localhost:5238'
npm start
```

Open http://127.0.0.1:3001. Set `PORT` to change the port.
The server proxies requests to the API, so browser CORS configuration is not
needed. `.env.example` documents variables; `.env` is not loaded automatically.
Alternatively copy it to `.env`, edit the values, then run
`node --env-file=.env server.mjs`.

Start the API from a separate terminal using the correct application database:

```powershell
cd E:\cleanmate\backend
dotnet run --project CleanMate.Api --no-launch-profile --urls http://localhost:5238
```

## Create the first administrator

Public signup never grants Admin or Staff. Run the local bootstrap command
against the intended database. Set `ConnectionStrings__Default` explicitly if
the API's existing configuration does not point to that database. This command
applies migrations, creates an Admin and exits without starting the API.
It refuses to promote an existing customer/staff account; choose a new email.
For an existing active Admin it leaves the name and password unchanged.

From `backend/`, in PowerShell:

```powershell
$env:CLEANMATE_ADMIN_EMAIL = Read-Host 'Admin email'
$env:CLEANMATE_ADMIN_NAME = Read-Host 'Admin name'
$adminSecret = Read-Host 'Password (12+ characters, max 72 UTF-8 bytes)' -AsSecureString
$adminCredential = [System.Net.NetworkCredential]::new('', $adminSecret)
try {
    $env:CLEANMATE_ADMIN_PASSWORD = $adminCredential.Password
    dotnet run --project CleanMate.Api --no-launch-profile -- --create-admin
} finally {
    Remove-Item Env:CLEANMATE_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    $adminCredential = $null
    $adminSecret.Dispose()
}
```

Sign in through this portal and create Staff accounts from its Staff page.
Locking a Staff account also invalidates its existing access tokens.

## Build and test

```powershell
npm run build
npm test
```

The build produces `dist/`. To serve it through the same API proxy:

```powershell
$env:CLEANMATE_ADMIN_ROOT = Join-Path $PWD 'dist'
npm start
```

For full system tests, keep `admin/` and `backend/` as sibling folders, build
`../backend/CleanMate.sln`, install Chromium with `npx playwright install chromium`,
then run `npm run build` and `npm run test:e2e` here.
The suite uses a generated local SQL Server database and deletes it afterward.
It never uses application data. Requires local database create/drop permissions.
It covers 16 cases across desktop and mobile with the real API and database,
including staff resolution of support reports and reporter notifications.
The Security page changes the current Admin/Staff password and invalidates all old
JWT sessions, including the current one. Tests verify staff reauthentication and
that a wrong current password does not sign the user out.
Security also offers confirmed logout from all CleanMate sessions without changing
the password. The suite verifies cancellation, revocation and signing in again.
Do not run alongside the customer web system tests: they share test host ports.
The synthetic admin credentials inside test fixtures belong only to these
temporary databases and are never provisioned in an application database.

For deployment, run the Node server behind an HTTPS reverse proxy and configure
`CLEANMATE_API_URL` for the private shared API. Do not publish the project directory
as a generic file server. No hosting or deployment is configured here.

## Git

Authentication limits apply to Admin and Staff. The portal preserves backend
retry instructions and replaces browser-provided IP forwarding headers with the
socket peer IP. Staff creation accepts 12+ characters and at most 72 UTF-8 bytes.
Deployment limits/proxy trust and test scope: ../backend/AUTH_RATE_LIMITS.md.

This repository tracks only `admin/`. Backend changes must be committed in
`CleanmateBackend`; customer web changes in `CleanMateFrontend`.
After creating an empty remote repository, connect it using
`git remote add origin <your-admin-repository-url>`.

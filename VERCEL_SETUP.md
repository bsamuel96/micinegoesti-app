# Mici de Negoesti - Vercel deployment setup

Last updated: 2026-08-04

Repository: `bsamuel96/micinegoesti-app`

This repository contains three independently deployed Vercel projects. The local
`micinegoesti/` source folder is intentionally ignored and must never be deployed
or committed from this repository.

Do not store passwords, API keys, tokens, database connection strings, or other
secrets in this file. Store them in each Vercel project's Environment Variables.

## Deployment overview

| Application | Root directory | Status | Production URL |
| --- | --- | --- | --- |
| API | `micinegoesti_api` | Deployed; health fix pending | <https://micinegoesti-api-alpha.vercel.app> |
| Customer interface | `micinegoesti_client` | Deployed; settings/redeploy pending | <https://client-micinegoesti.vercel.app> |
| Dashboard | `micinegoesti_dashboard` | Pending | Add after deployment |

## API

### Vercel project settings

| Setting | Value |
| --- | --- |
| Project name | `micinegoesti-api` |
| Root Directory | `micinegoesti_api` |
| Application Preset | Express |
| Build Command | Default (`npm run build`) |
| Output Directory | None / N/A |
| Install Command | Default (`npm install`) |
| Node.js version | `22.x` from `package.json` |

Production API base URL for the frontends:

```text
https://micinegoesti-api-alpha.vercel.app/api
```

Health endpoints:

```text
https://micinegoesti-api-alpha.vercel.app/
https://micinegoesti-api-alpha.vercel.app/api/health
```

The build completed successfully on 2026-08-04. A public health check then
returned `FUNCTION_INVOCATION_FAILED`; the runtime interop fix in `src/app.ts`
must be deployed and the two endpoints above must return HTTP 200 before either
frontend is considered connected.

The full list of API environment variable names is maintained in
`micinegoesti_api/.env.example`. Real values belong only in Vercel. Production
must use a strong `JWT_SECRET`, server-only Supabase credentials, and the final
customer/dashboard origins in `CLIENT_URL` and `CORS_ORIGINS`.

### Production database warning

The current Prisma schema uses SQLite. Vercel Functions have ephemeral local
storage, so a local SQLite file cannot be used as the durable production database.
The API can deploy and answer health checks, but real users, sessions, carts, and
orders require migration to an external persistent database before launch.

Vercel reference: <https://vercel.com/kb/guide/is-sqlite-supported-in-vercel>

## Customer interface - deploy next

### Vercel project settings

| Setting | Value |
| --- | --- |
| Suggested project name | `micinegoesti-client` |
| Root Directory | `micinegoesti_client` |
| Framework Preset | Vite |
| Build Command | Default (`npm run build`) |
| Output Directory | `dist` |
| Install Command | Default (`npm install`) |
| Node.js version | `22.x` from `package.json` |

### Environment variables

Add these variables to the customer project's Production environment before
deploying:

```text
VITE_API_URL=https://micinegoesti-api-alpha.vercel.app/api
VITE_GOOGLE_MAPS_API_KEY=<browser-restricted Google Maps key>
VITE_GOOGLE_MAPS_MAP_ID=<Google Maps map ID>
```

Do not add a placeholder value for `VITE_DASHBOARD_URL`. Add it with the real
dashboard production origin after the dashboard is deployed, then redeploy the
customer project.

`VITE_*` variables are included in the browser build. Never use a server secret
as a `VITE_*` value. Changing any of these variables requires a new deployment.

### Required post-deploy updates

1. In the API Vercel project, add the customer origin to both `CLIENT_URL` and
   `CORS_ORIGINS`, then redeploy the API.
2. In Google Cloud Console, authorize this customer referrer:
   `https://client-micinegoesti.vercel.app/*`.
3. Keep Maps JavaScript API, Geocoding API, and Routes API enabled for the browser
   key used by the customer application.
4. Verify the homepage, `/track`, `/orders`, API requests, map, route line, and
   customer live courier movement.

### Single-page application routing

The customer app uses `BrowserRouter`. Direct visits and refreshes on routes such
as `/track` and `/orders` use the rewrite committed in
`micinegoesti_client/vercel.json`:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## Dashboard - deploy after the customer interface

### Vercel project settings

| Setting | Value |
| --- | --- |
| Suggested project name | `micinegoesti-dashboard` |
| Root Directory | `micinegoesti_dashboard` |
| Framework Preset | Vite |
| Build Command | Default (`npm run build`) |
| Output Directory | `dist` |
| Install Command | Default (`npm install`) |
| Node.js version | `22.x` from `package.json` |

Dashboard environment variables:

```text
VITE_API_URL=https://micinegoesti-api-alpha.vercel.app/api
VITE_STOREFRONT_URL=https://client-micinegoesti.vercel.app
VITE_GOOGLE_MAPS_API_KEY=<browser-restricted Google Maps key>
VITE_GOOGLE_MAPS_MAP_ID=<Google Maps map ID>
```

After dashboard deployment, add its origin to the API `CLIENT_URL` and
`CORS_ORIGINS`, add it to the Google Maps key's authorized referrers, update
`VITE_DASHBOARD_URL` in the customer project, and redeploy the affected projects.

The dashboard also uses `BrowserRouter`; its `/index.html` SPA rewrite is
committed in `micinegoesti_dashboard/vercel.json`.

## Git deployment workflow

Each Vercel project is connected to the same GitHub repository and watches only
its configured root directory. Publish setup changes from the repository root:

```bash
git add VERCEL_SETUP.md micinegoesti_client/vercel.json micinegoesti_dashboard/vercel.json
git commit -m "Record customer deployment and configure Vite routing"
git push origin main
```

When a frontend receives its final production URL, update this file and commit
the deployment record.

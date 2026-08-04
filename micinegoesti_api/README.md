# micinegoesti_api

Shared backend for the customer PWA and staff dashboard.

This standalone project mirrors the current Express/TypeScript API, Prisma schema, and Supabase SQL migrations from `micinegoesti`. Existing local environment files and development data in this folder are preserved during synchronization.

The delivery API includes courier assignment, nearest-order selection, delivery session state, throttled courier location updates, and customer-authorized live-location reads. Road polylines and ETA are calculated in the browser with Google Routes API; Google browser credentials do not belong in this service.

## Local development

```bash
cp .env.example .env
npm install
npm run db:generate
npm run dev
```

API: `http://localhost:4000/api/health`

Use `CORS_ORIGINS=http://localhost:5173,http://localhost:5174` locally. In production, replace these with the deployed client and dashboard origins.

## Database boundary

- `micinegoesti_client` calls this API.
- `micinegoesti_dashboard` calls this API.
- Only this API receives `SUPABASE_SERVICE_ROLE_KEY`.
- Authentication and role authorization are enforced here, even when the dashboard hides an action.

Point this API at the same Supabase project when you are ready to use the existing production data. Start with a non-production/preview Supabase project for migrations and development.

Apply migrations in numerical order, including `db/29_courier_live_tracking.sql`, before using live delivery tracking. The API stores only the latest courier position for each active delivery rather than a permanent movement history.

# micinegoesti_client

Standalone customer storefront extracted from the current `micinegoesti/client` application. It contains the public menu, cart, checkout, phone authentication, customer account, vouchers, game, order history, order tracking, and the live courier route map. Staff URLs redirect to the separate dashboard.

## Local development

```bash
cp .env.example .env
npm install
npm run dev
```

The app runs at `http://localhost:5173`; the shared API defaults to `http://localhost:4000/api`, and staff links default to `http://localhost:5174`.

Configure `VITE_GOOGLE_MAPS_API_KEY` and `VITE_GOOGLE_MAPS_MAP_ID`, with Maps JavaScript API, Geocoding API, and Routes API enabled. Restrict the browser key to the deployed customer origin. Production must use HTTPS for PWA installation and customer/courier geolocation.

Only variables prefixed with `VITE_` reach the browser. Never place `SUPABASE_SERVICE_ROLE_KEY` or other server credentials here.

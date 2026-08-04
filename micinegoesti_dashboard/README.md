# micinegoesti_dashboard

Interfața independentă pentru administrarea și operarea Mici de Negoești. Include fluxurile pentru administrator, manager, bucătărie și curier din starea curentă a aplicației principale.

Curierul primește cea mai apropiată comandă eligibilă, lucrează cu o singură comandă în focus și vede traseul rutier în modul hartă fullscreen. În timpul livrării, poziția transmisă alimentează și harta live a clientului.

## Dezvoltare locală

```bash
cp .env.example .env
npm install
npm run dev
```

Dashboard-ul rulează implicit la `http://localhost:5174`, magazinul la `http://localhost:5173`, iar API-ul comun la `http://localhost:4000/api`.

Configurează în `.env`:

- `VITE_API_URL` pentru API;
- `VITE_STOREFRONT_URL` pentru legăturile către interfața clientului;
- `VITE_GOOGLE_MAPS_API_KEY` și `VITE_GOOGLE_MAPS_MAP_ID` pentru harta, ruta și poziția curierului.

Cheia Google Maps trebuie restricționată la originile dashboard-ului și trebuie să aibă Maps JavaScript API și Routes API activate. Nu expune niciodată chei de server sau `SUPABASE_SERVICE_ROLE_KEY` într-o variabilă `VITE_`.

## Verificare

```bash
npm test
npm run typecheck
npm run build
```

Build-ul de producție include manifestul PWA, fallback offline și service worker-ul dashboard-ului.

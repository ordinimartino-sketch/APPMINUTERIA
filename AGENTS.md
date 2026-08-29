# AGENTS.md

## Stack & Requirements
- Node **>=22.5.0** required (`package.json:14` `engines`). Uses `node:sqlite` `DatabaseSync` (`db/index.js:3`) — no native addons. Warning `SQLite is an experimental feature` at startup is expected.
- Single Express 5 + EJS app. Entrypoint `server.js`. No build step, no bundler, no TypeScript.
- Session: `express-session` in-memory (`server.js:25`), `SESSION_SECRET` from `.env` else `minuteria-mvp-demo-secret`. Cookie 12h. No Redis/DB store.

## Commands
```bash
npm install
npm run seed                          # idempotent — upserts users/distributors (db/seed.js:31)
node db/importa_catalogo.js file.csv  # import catalog; ; delimiter, needs Codice/Descrizione/Linea/Serie/U.M./Netto (db/importa_catalogo.js:148)
npm start                             # http://localhost:3000  (PORT env or 3000)
```
- No tests/linter/typecheck: `npm test` just `exit 1` (`package.json:9`). No CI workflows.
- Catalog mapping: `db/genera_mappa_super_categorie.js file.csv` generates `db/mappa_super_categorie.csv` (Linea -> super category), then `importa_catalogo.js` uses it. Linea not in map -> `Generico`.

## Structure
```
server.js          all routes + cart/request/order/DDT/geo/notifications (864 lines)
db/schema.sql      CREATE TABLE IF NOT EXISTS + config defaults
db/index.js        opens db/minuteria.db, WAL + FK, lightweight migrations, patches db.transaction()
db/seed.js         3 clienti (rossi/bianchi/verdi cliente123), 3 distributori (afis/borea/cambielli banco123), 1 agente (agente123), zona Genova
src/pricing.js     prezzoNetto / prezzoCliente (+10% servizio) / calcolaOrdine (IVA 22%) — reads config table
src/catalogo.js    cercaProdotti partial fragment search, macroCategorie, prodottiPerMacro
src/richieste.js   request lifecycle: creaRichiesta -> 10min window -> offerte -> ordine
src/ddt.js         DDT numbering per distributor/year (ddt_counters)
src/geo.js         consent-gated geolocation, revoke deletes coords
src/notifiche.js   in-app notifications + browser Notification polling
src/format.js / src/auth.js  helpers / requireLogin + requireRole('cliente'|'distributore'|'agente')
views/*.ejs        EJS pages (cliente mobile-first, distributore, agente); views/partials/
public/            style.css + app.js (qty stepper, live search fetch /api/cerca, countdown polling /api/richieste/:id, Notifications, watchPosition)
db/minuteria.db    SQLite file, auto-created, gitignored (.gitignore:2), WAL files .db-wal/.db-shm also ignored
```

## DB & Migrations
- `db/schema.sql` is baseline; `db/index.js:29-101` runs `aggiungiColonna` ALTER TABLE on startup for incremental columns (products.macro_slug, users.distributor_id/zona/anagrafica/geo, orders.request_id/distributor_id/ddt_*, etc.). Recreates `users` table if CHECK lacks `distributore` (`db/index.js:104`).
- `db.transaction(fn)` is monkey-patched onto DatabaseSync (`db/index.js:137`) — use `db.transaction(()=>{ ... })()` pattern (see `src/richieste.js:80`, `server.js:383`).
- Config table `config` holds `servizio_pct=10`, `iva_pct=22`, `finestra_conferma_min=10` (`db/schema.sql:72,159`). Change without code edit. Pricing snapshots copied to `order_items` at order creation.

## Key Flows & Gotchas
- **Cart in session** (`server.js:56-97`): `req.session.carrello = {productId: qty}`. Two modes: `aggiungi` (sum, zero ignored) vs `imposta` (replace, zero deletes) on `/carrello`.
- **Request -> offerta -> ordine**: `richieste.creaRichiesta` only targets active distributors in same `zona` covering **all** requested productIds (`src/richieste.js:53`). If none -> `nessuna_offerta`. Window controlled by `requests.scade_il` + `richieste.secondiRimasti` (`src/richieste.js:42`). `aggiornaScadenzeAperte()` polled every 30s (`server.js:854`) and on home/distributore routes. Non-response becomes `scaduto` and is not availability.
- **Distributore response** (`POST /distributore/richieste/:id/rispondi`): `disp_<productId>` qty per row. `rifiuta` -> all zero. Deduced `esito=confermato|non_disponibile`, `copertura=totale|parziale`. `consegna_ore` clamped `>= partenza_ore` (`src/richieste.js:226`). First `confermato` flips request to `con_offerte` — client can order before window ends.
- **Offer sorting**: `offerte()` totals first, partials last (`src/richieste.js:401`).
- **Order creation** (`POST /ordini`): transaction inserts `orders` + `order_items` snapshots + marks other `in_attesa` responses as `scaduto`. Pricing via `calcolaOfferta` + `pricing.calcolaOrdine`.
- **DDT**: `POST /distributore/ordini/:id/ddt` requires `stato=in_evasione` first (`server.js:773`); `ddt.emetti` increments `ddt_counters` per distributor/year -> `n/YYYY`. View `/ddt/:id` restricted to owner cliente/distributore/agente and requires `ddt_numero`.
- **Geo**: always consent-gated. `POST /api/posizione` saves coords, throttled 10s in `public/app.js:235`. `POST /api/posizione/revoca` deletes coords + disables `orders.tracciamento_attivo`. Per-order sharing via `POST /api/ordini/:id/tracciamento`.
- **Notifications**: polled via `GET /api/notifiche/push` every 10s (`public/app.js:183`), converted to `new Notification()` if permission granted. Bell count from `res.locals.notificheNonLette` (`server.js:43`).
- **Search**: `cercaProdotti` does `LIKE %term%` per word across `nome/codice/categoria/serie/macro_nome` (`src/catalogo.js:21`), prefix match ordering on first term. Client live search threshold >=2 chars (`server.js:183` + `public/app.js:60`).
- **Auth**: `src/auth.js:1` `requireLogin`/`requireRole`. Three roles only. Cliente sees own orders, distributore only own distributor_id. `order_items` price fields: `prezzo_netto_unitario` vs `prezzo_unitario_cliente` (+10%).
- **Env**: only `PORT` and `SESSION_SECRET` via `dotenv`. `.env` and `db/minuteria.db*` are gitignored — never commit.

## Demo Credentials (seed)
- cliente: `rossi`/`bianchi`/`verdi` / `cliente123` — distributore: `afis`/`borea`/`cambielli` / `banco123` — agente: `agente` / `agente123` (see README.md:23 + db/seed.js:114)

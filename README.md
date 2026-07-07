# Wo is meine Porta?

Verfügbarkeits-Tracker für die **Midea PortaSplit** und **PortaSplit Cool** in Österreich —
inspiriert von bestell.bar, aber für genau ein Produkt. Prüft österreichische Händler
laufend (30-Sekunden-Takt für die schnelle Stufe) und schickt Sofort-Alarme per Web Push
oder E-Mail, sobald das Gerät wieder bestellbar ist — online **und** je Filiale.

**Stack:** Next.js 16 (App Router, React Compiler, `output: standalone`), React 19,
TypeScript 6, Tailwind v4, TypeORM + better-sqlite3, [impit](https://github.com/apify/impit)
(Chrome-Fingerprint-Fetch für Cloudflare-geschützte Händler), Leaflet + OpenStreetMap,
web-push, Brevo (EU-E-Mail). Läuft auf Node 24 als **ein einziger Docker-Container** (Dokploy), SQLite
auf einem Volume — keine weiteren Dienste (kein Redis, keine DB, kein Headless-Browser).

## Features

- **Online- und Filial-Verfügbarkeit** für beide Varianten, laufend geprüft.
- **Sofort-Alarm** per **Web Push** (VAPID) oder **E-Mail** (Double-Opt-in via Brevo),
  variantengenau, optional zusätzlich für Filialen im PLZ-Umkreis. 60-Minuten-Cooldown
  gegen Alarm-Spam.
- **Live ohne Client-Polling:** Server-Sent Events (`/api/live`) — der Client aktualisiert
  nur, wenn ein Tick echte Änderungen produziert.
- **Filialkarte** (Leaflet + OSM, kein API-Key): PLZ- **und** Standortsuche
  („In meiner Nähe"), Händlerfilter, Cluster nach Verfügbarkeit eingefärbt
  (rot = keine · gelb = eine · grün = mehrere lagernd), Karte ↔ Liste synchronisiert.
- **SEO:** Product/FAQ JSON-LD, `sitemap.xml`, `robots.txt`, OpenGraph.
- **Sicherheit:** Content-Security-Policy + Security-Header, Per-IP-Rate-Limiting auf den
  öffentlichen API-Routen, Double-Opt-in gegen E-Mail-Missbrauch.
- **Barrierefrei:** WCAG-AA-Kontraste (hell & dunkel), `prefers-reduced-motion`,
  semantisches HTML.
- **Selbstpflegend:** automatische Bereinigung alter Events/Logs, Container-Healthcheck,
  Env-Prüfung beim Start (fehlende Push/E-Mail-Konfiguration wird geloggt, nicht fatal).

## Händler-Abdeckung

| Händler    | Online-Status      | Filial-Bestand                                       |
| ---------- | ------------------ | ---------------------------------------------------- |
| OBI        | ✓                  | ✓ je Filiale (exakte Stückzahl, OBI Store-Locator)   |
| BAUHAUS    | ✓                  | ✓ je Filiale (23 Fachcentren, öffentliche api.bauhaus) |
| MediaMarkt | ✓                  | nur Sammelsignal („in einzelnen Märkten abholbar")   |
| Tepto      | ✓ (nur PortaSplit) | —                                                    |

BAUHAUS und MediaMarkt sind Cloudflare-geschützt; die Online-Seiten werden per
impit (Chrome-TLS/HTTP-Fingerprint) abgerufen. Die BAUHAUS-Filialdaten kommen ohne
Headless-Browser über die öffentliche `api.bauhaus` (apiKey aus der PDP + Origin-Header).
MediaMarkts Filial-API liegt hinter aggressiver Bot-Abwehr, die impit **nicht** passiert —
daher nur das Sammelsignal. Details und Endpoints: [docs/retailers.md](docs/retailers.md).

## Live-Updates

Statt Polling hält der Client eine Server-Sent-Events-Verbindung (`/api/live`). Der Poller
sendet über einen In-Process-Bus (`src/lib/live-bus.ts`) nur dann ein `change`-Event, wenn
ein Tick echte Statusänderungen produziert — dann aktualisiert der Client sofort per
`router.refresh()`. Zwischen Änderungen fällt weder Server-Render- noch Payload-Last an (nur
SSE-Heartbeats). Relative Zeitstempel („vor 3 Min geprüft") tickt der Client selbst,
unabhängig vom Refresh. Fällt SSE aus (Proxy), greift ein 2-Minuten-Fallback plus Refresh
bei Tab-Fokus.

## Entwicklung

```bash
pnpm install
cp .env.example .env               # Werte eintragen, siehe unten
npx web-push generate-vapid-keys   # → VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
pnpm dev                           # http://localhost:3000
pnpm test                          # Vitest
pnpm lint                          # ESLint
pnpm build                         # Produktions-Build (Turbopack)
```

Der Poller startet nur mit `ENABLE_POLLER=1` (in dev standardmäßig aus). Ein einzelner Check
lässt sich jederzeit manuell auslösen:

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_SECRET" http://localhost:3000/api/admin/check
```

## Umgebungsvariablen

| Variable                                                   | Zweck                                                                                           |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `DATABASE_PATH`                                            | SQLite-Datei (Container: `/data/app.db`)                                                        |
| `ENABLE_POLLER`                                            | `1` = Verfügbarkeits-Poller läuft im Prozess                                                    |
| `POLL_FAST_MS` / `POLL_SLOW_MS`                            | Intervalle (Default 30.000 / 180.000 ms)                                                        |
| `ADMIN_SECRET`                                             | Bearer-Token für `POST /api/admin/check` (`openssl rand -hex 32`)                               |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (`npx web-push generate-vapid-keys`; Subject = `mailto:…`)                             |
| `BREVO_API_KEY` / `EMAIL_FROM` / `EMAIL_REPLY_TO`          | E-Mail-Alarme via [Brevo](https://brevo.com) (EU; Domain verifizieren, Free-Tier: 300 Mails/Tag) |
| `PUBLIC_BASE_URL`                                          | Öffentliche URL — für Canonical/OpenGraph, `sitemap.xml`/`robots.txt` und E-Mail-Links         |

Fehlende Push-/E-Mail-/URL-Variablen sind kein Fehler: das jeweilige Feature bleibt
deaktiviert und wird beim Start geloggt (`[env] … disabled/degraded — missing: …`).

## Deployment auf Dokploy

1. **App anlegen:** Neues Projekt → Application → Source: dieses Git-Repo, Build Type
   **Dockerfile**.
2. **Volume:** Mount `/data` (Volume-Name z. B. `porta-data`) — dort liegt die SQLite-DB mit
   Abos und Verlauf. **Wichtig:** ohne Volume gehen bei jedem Redeploy alle Abonnements
   verloren. Backup = diese eine Datei sichern.
3. **Env-Vars** aus der Tabelle oben setzen (`ENABLE_POLLER=1`, `DATABASE_PATH=/data/app.db`
   sind im Image schon Default). `PUBLIC_BASE_URL` auf die echte Domain setzen.
4. **Replicas: 1** — der Poller läuft im App-Prozess; mehrere Replicas würden doppelt pollen
   und doppelt benachrichtigen.
5. **Domain + HTTPS** über Dokploy/Traefik (Let's Encrypt). HTTPS ist Pflicht für Web Push
   und die Standortsuche.
6. Deploy. Der Container bringt einen `HEALTHCHECK` auf `/api/status` mit; die Logs zeigen
   `[poller] starting, tick every 30000ms` und danach die Tick-Summaries.

Das Produktions-Image ist verifiziert (Node 24, nativer better-sqlite3-Build,
`pnpm --frozen-lockfile`, standalone).

### Schema-Änderungen

TypeORM läuft mit `synchronize: true`: neue Spalten/Tabellen werden beim Start automatisch
angelegt. Vor Updates mit Schema-Änderungen die DB-Datei sichern (`/data/app.db` kopieren).

### MediaMarkt hinter Cloudflare WARP (optional, experimentell)

MediaMarkts Cloudflare blockt Rechenzentrums-IPs (403), OBI/BAUHAUS/Tepto nicht. Um **nur
MediaMarkt** über eine „saubere" IP zu leiten, kann man einen Cloudflare-WARP-Proxy als
Sidecar betreiben und `MEDIAMARKT_PROXY_URL` darauf zeigen lassen — der restliche Traffic
bleibt direkt.

1. WARP-Proxy-Container danebenstellen (z. B. Image `caomingjun/warp`), der einen **SOCKS5**-
   Proxy auf `:40000` bereitstellt (in Dokploy als zweiter Service / via Compose).
2. `MEDIAMARKT_PROXY_URL=socks5://<warp-service>:40000` in den App-Env-Vars setzen.
3. Deploy, dann Logs prüfen: verschwindet der `errors.mediamarkt`-Eintrag, klappt WARP.

Hinweis: WARP nutzt Cloudflare-eigene Egress-IPs — ob deren IP von MediaMarkts Bot-Abwehr
akzeptiert wird, ist nicht garantiert. Schlägt es fehl, ist MediaMarkt (reines Online-Signal)
verzichtbar; die Kern-Filialdaten liefern OBI und BAUHAUS.

## Hinweise

- **Kein Shop.** Die Seite verlinkt nur zu den Händlern; alle Angaben ohne Gewähr.
- Impressum/Offenlegung (§25 MedienG) in `src/app/impressum/page.tsx`, Verantwortlicher
  (DSGVO) in `src/app/datenschutz/page.tsx` — beim Fork mit eigenen Angaben ersetzen.
- PLZ-Geodaten: [GeoNames](https://www.geonames.org/) (CC BY 4.0), Build via
  `pnpm tsx scripts/build-plz.ts`.
- iOS-Push funktioniert erst, wenn die Seite zum Home-Bildschirm hinzugefügt wurde (PWA) —
  die UI weist darauf hin.

## Lizenz

MIT — siehe [LICENSE](LICENSE). © 2026 Julian Pufler.

Kein offizielles Angebot von und keine Verbindung zu Midea, OBI, BAUHAUS, MediaMarkt oder
Tepto. Alle Marken gehören ihren jeweiligen Inhabern.

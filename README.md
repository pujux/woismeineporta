# Wo ist meine Porta? 🌬️

Verfügbarkeits-Tracker für die **Midea PortaSplit** und **PortaSplit Cool** in Österreich —
inspiriert von bestell.bar, aber für genau ein Produkt. Prüft österreichische Händler im
30-Sekunden-Takt und verschickt Sofort-Alarme per Web Push und E-Mail, sobald das Gerät
wieder bestellbar ist.

**Stack:** Next.js 16 (App Router, standalone), TypeScript, Tailwind v4, TypeORM +
better-sqlite3, web-push, Resend. Läuft als ein einziger Docker-Container (Dokploy),
SQLite auf einem Volume — keine weiteren Dienste nötig.

## Händler-Abdeckung

| Händler | Online-Status | Filial-Bestand |
|---|---|---|
| OBI | ✓ | ✓ (79 Märkte, exakte Verfügbarkeit) |
| MediaMarkt | ✓ | nur Sammelsignal („in einzelnen Märkten abholbar") |
| Tepto | ✓ (nur PortaSplit) | — |
| BAUHAUS | best effort (Cloudflare-blockiert → „Status unbekannt") | — |

Details und Endpoints: [docs/retailers.md](docs/retailers.md).

## Entwicklung

```bash
pnpm install
cp .env.example .env          # Werte eintragen, siehe unten
npx web-push generate-vapid-keys   # → VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
pnpm dev                      # http://localhost:3000
pnpm test                     # Vitest
```

Der Poller startet nur mit `ENABLE_POLLER=1` (in dev standardmäßig aus). Ein einzelner
Check lässt sich jederzeit manuell auslösen:

```bash
curl -X POST -H "Authorization: Bearer $ADMIN_SECRET" http://localhost:3000/api/admin/check
```

## Umgebungsvariablen

| Variable | Zweck |
|---|---|
| `DATABASE_PATH` | SQLite-Datei (Container: `/data/app.db`) |
| `ENABLE_POLLER` | `1` = Verfügbarkeits-Poller läuft im Prozess |
| `POLL_FAST_MS` / `POLL_SLOW_MS` | Intervalle (Default 30.000 / 180.000 ms) |
| `ADMIN_SECRET` | Bearer-Token für `POST /api/admin/check` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (`npx web-push generate-vapid-keys`; Subject = `mailto:…`) |
| `RESEND_API_KEY` / `EMAIL_FROM` | E-Mail-Alarme via [Resend](https://resend.com) (Domain verifizieren, Free-Tier: 100 Mails/Tag) |
| `PUBLIC_BASE_URL` | Öffentliche URL, wird in E-Mail-Links verwendet |

## Deployment auf Dokploy

1. **App anlegen:** Neues Projekt → Application → Source: dieses Git-Repo, Build Type
   **Dockerfile**.
2. **Volume:** Mount `/data` (Volume-Name z. B. `porta-data`) — dort liegt die SQLite-DB.
   Backup = diese eine Datei sichern.
3. **Env-Vars** aus der Tabelle oben setzen (`ENABLE_POLLER=1`, `DATABASE_PATH=/data/app.db`
   sind im Image schon Default).
4. **Replicas: 1** — der Poller läuft im App-Prozess; mehrere Replicas würden doppelt
   pollen und doppelt benachrichtigen.
5. **Domain + HTTPS** über Dokploy/Traefik (Let's Encrypt). HTTPS ist Pflicht für Web Push.
6. Deploy. Logs zeigen `[poller] starting, tick every 30000ms` und danach die Tick-Summaries.

### Schema-Änderungen

TypeORM läuft mit `synchronize: true`: neue Spalten/Tabellen werden beim Start automatisch
angelegt. Vor Updates mit Schema-Änderungen die DB-Datei sichern (`/data/app.db` kopieren).

## Hinweise

- **Kein Shop.** Die Seite verlinkt nur zu den Händlern; alle Angaben ohne Gewähr.
- `src/app/impressum/page.tsx` enthält Platzhalter — vor dem öffentlichen Betrieb mit
  echten Angaben (§5 ECG) befüllen; gleiches gilt für den Verantwortlichen in
  `src/app/datenschutz/page.tsx`.
- PLZ-Geodaten: [GeoNames](https://www.geonames.org/) (CC BY 4.0), Build via
  `pnpm tsx scripts/build-plz.ts`.
- iOS-Push funktioniert erst, wenn die Seite zum Home-Bildschirm hinzugefügt wurde
  (PWA) — die UI weist darauf hin.

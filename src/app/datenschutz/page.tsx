import type { Metadata } from "next";

export const metadata: Metadata = { title: "Datenschutz — Wo ist meine Porta?" };

export default function Datenschutz() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10">
      <h1 className="text-2xl font-bold">Datenschutzerklärung</h1>
      <div className="mt-6 space-y-5 text-sm leading-6 text-slate-700">
        <section>
          <h2 className="font-semibold text-slate-900">Verantwortlicher</h2>
          {/* TODO(Julian): mit Impressum-Daten befüllen */}
          <p>[Name, Adresse, E-Mail — siehe Impressum]</p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">Keine Cookies, kein Tracking</h2>
          <p>
            Diese Website setzt keine Cookies und verwendet keine Analyse- oder Tracking-Dienste.
            Beim Aufruf werden die technisch notwendigen Zugriffsdaten (IP-Adresse, Zeitpunkt,
            abgerufene Seite) in Server-Logs verarbeitet (Art. 6 Abs. 1 lit. f DSGVO) und nach
            kurzer Zeit gelöscht.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">Push-Benachrichtigungen</h2>
          <p>
            Wenn du den Push-Alarm aktivierst, speichern wir die von deinem Browser erzeugte
            Push-Adresse (Endpoint deines Browser-Herstellers, z.&nbsp;B. Google/Mozilla/Apple)
            samt kryptografischer Schlüssel sowie deine gewählten Einstellungen (Produktvarianten,
            optional PLZ und Umkreis). Rechtsgrundlage: deine Einwilligung (Art. 6 Abs. 1 lit. a
            DSGVO). Du kannst den Alarm jederzeit auf der Startseite deaktivieren — damit werden
            die Daten gelöscht. Nicht mehr erreichbare Push-Adressen löschen wir automatisch.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">E-Mail-Alarm</h2>
          <p>
            Beim E-Mail-Alarm speichern wir deine E-Mail-Adresse und Einstellungen erst nach
            Bestätigung (Double-Opt-in). Rechtsgrundlage: Einwilligung (Art. 6 Abs. 1 lit. a
            DSGVO). Jede E-Mail enthält einen Abmeldelink; mit der Abmeldung werden deine Daten
            gelöscht. Für den Versand nutzen wir Resend (Resend, Inc., USA) als
            Auftragsverarbeiter; der Versand erfolgt auf Basis von EU-Standardvertragsklauseln.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">PLZ-Suche</h2>
          <p>
            Die Filialsuche verarbeitet die eingegebene PLZ nur zur Beantwortung der Anfrage und
            speichert sie nicht. Geodaten der PLZ stammen von GeoNames (CC BY 4.0).
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">Hosting</h2>
          <p>Die Website wird auf eigener Infrastruktur in der EU betrieben.</p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900">Deine Rechte</h2>
          <p>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der
            Verarbeitung, Datenübertragbarkeit und Widerruf erteilter Einwilligungen sowie das
            Recht auf Beschwerde bei der österreichischen Datenschutzbehörde (dsb.gv.at).
          </p>
        </section>
      </div>
    </main>
  );
}

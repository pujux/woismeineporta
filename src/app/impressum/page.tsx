import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Impressum & Offenlegung — Wo is meine Porta?" };

export default function Impressum() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10">
      <Link href="/" className="mb-4 inline-block text-sm text-sky-700 underline hover:text-sky-800 dark:text-sky-400 dark:hover:text-sky-300">
        ← Zurück zur Startseite
      </Link>
      <h1 className="text-2xl font-bold">Impressum &amp; Offenlegung</h1>
      <div className="mt-6 space-y-5 text-sm leading-6 text-slate-700 dark:text-slate-300">
        <section>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Offenlegung gemäß § 25 Mediengesetz</h2>
          <p className="mt-1">Medieninhaber und für den Inhalt verantwortlich:</p>
          <address className="mt-1 not-italic">
            <strong>Julian Pufler</strong>
            <br />
            Wien, Österreich
            <br />
            E-Mail:{" "}
            <a className="underline hover:text-slate-900 dark:hover:text-slate-100" href="mailto:julian@pufler.dev">
              julian@pufler.dev
            </a>
          </address>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Gegenstand des Mediums</h2>
          <p>
            Privat und unentgeltlich betriebener, nichtkommerzieller Informationsdienst. Die Website bündelt und stellt öffentlich verfügbare
            Verfügbarkeits- und Preisinformationen zur Midea PortaSplit bei österreichischen Händlern dar. Es werden keine Waren verkauft, keine
            Werbung geschaltet und keine Einnahmen erzielt.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Grundlegende Richtung</h2>
          <p>
            Unabhängige, unentgeltliche Information von Konsumentinnen und Konsumenten über die Verfügbarkeit eines einzelnen Produkts in Österreich.
            Keine kommerzielle Absicht.
          </p>
        </section>

        <section>
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Hinweis</h2>
          <p>
            Diese Website ist kein Online-Shop und steht in keiner Verbindung zu Midea, BAUHAUS, OBI, MediaMarkt, Tepto oder Amazon. Alle Marken sind Eigentum
            ihrer jeweiligen Inhaber. Alle Angaben ohne Gewähr; Preise und Verfügbarkeiten können abweichen.
          </p>
        </section>
      </div>
    </main>
  );
}

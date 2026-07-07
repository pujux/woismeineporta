import type { Metadata } from "next";

export const metadata: Metadata = { title: "Impressum — Wo is meine Porta?" };

export default function Impressum() {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10">
      <h1 className="text-2xl font-bold">Impressum</h1>
      <div className="prose prose-slate mt-6 text-sm leading-6 text-slate-700 dark:text-slate-300">
        {/* TODO(Julian): Angaben gemäß §5 ECG / §25 MedienG ergänzen */}
        <address className="not-italic">
          <strong>[Vor- und Nachname / Firma]</strong>
          <br />
          [Straße Hausnummer]
          <br />
          [PLZ Ort], Österreich
          <br />
          E-Mail: [kontakt@woismeineporta.at]
        </address>
        <p className="mt-4">
          Unternehmensgegenstand: Unentgeltlicher Informationsdienst zur Produktverfügbarkeit. Diese Website ist kein Online-Shop und steht in keiner
          Verbindung zu Midea, BAUHAUS, OBI, MediaMarkt oder Tepto. Alle Marken sind Eigentum ihrer jeweiligen Inhaber.
        </p>
      </div>
    </main>
  );
}

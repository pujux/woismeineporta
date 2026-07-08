// Shared, framework-free product copy. Imported by ProductInfo (visible section)
// and by the SEO builders (Product/FAQ JSON-LD) so the on-page text and the
// structured data can never drift apart.

export const BRAND = "Midea";

/** Per-variant description, keyed by variant slug. Used in Product JSON-LD. */
export const PRODUCT_DESCRIPTIONS: Record<string, string> = {
  portasplit:
    "Die Midea PortaSplit ist eine mobile Split-Klimaanlage mit 3,5 kW (12.000 BTU) und vier Funktionen: Kühlen, Heizen, Entfeuchten und Ventilieren. Weil sie auch heizt, lässt sie sich ganzjährig nutzen — im Winter als flexible Zusatzheizung. Angeschlossen wird sie ohne Monteur: Innen- und Außeneinheit sind über eine vorbefüllte, absperrbare Schnellkupplung verbunden, die du durch ein gekipptes Fenster oder eine Maueröffnung führst. Dadurch kühlt sie leiser und sparsamer als ein Monoblock-Gerät.",
  "portasplit-cool":
    "Die Midea PortaSplit Cool ist das reine Kühlmodell: 2,35 kW (8.000 BTU) zum Kühlen, Entfeuchten und Ventilieren — sie heizt nicht. Ausgelegt ist sie für Räume bis rund 28 m². Aufbau und selbst montierbare Schnellkupplung sind identisch zur Standard-PortaSplit, sie ist günstiger und minimal leiser — dafür fehlt die Heizfunktion.",
};

export interface FaqItem {
  question: string;
  answer: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Wo bekomme ich die PortaSplit in Österreich?",
    answer:
      "Wir beobachten laufend mehrere in Österreich lieferbare Händler: OBI, BAUHAUS, MediaMarkt, Tepto und Amazon. Bei OBI und BAUHAUS siehst du zusätzlich die Verfügbarkeit je Filiale, bei MediaMarkt, Tepto und Amazon den Online-Bestand. Sobald ein Händler wieder Lagerbestand hat, steht das hier oben — inklusive Preis — und wir verlinken direkt zum Shop.",
  },
  {
    question: "Warum ist die PortaSplit so oft ausverkauft?",
    answer:
      "Als leises Split-Gerät ohne fixe Installation ist sie sehr gefragt und über den Sommer regelmäßig vergriffen. Genau dafür gibt es diese Seite: Richt dir einen Alarm per Push oder E-Mail ein und du erfährst sofort, sobald sie wieder bestellbar ist.",
  },
  {
    question: "Kostet der Verfügbarkeits-Alarm etwas?",
    answer: "Nein. Der Alarm ist gratis und jederzeit mit einem Klick abbestellbar. Wir verkaufen nichts — wir verlinken nur zu den Händlern.",
  },
];

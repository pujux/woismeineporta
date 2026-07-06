import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Wo ist meine Porta? — Midea PortaSplit Verfügbarkeit Österreich",
  description:
    "Live-Verfügbarkeit der Midea PortaSplit und PortaSplit Cool bei österreichischen Händlern — mit Sofort-Alarm per Push oder E-Mail, sobald sie wieder bestellbar ist.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#0284c7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900">
        {children}
        <footer className="mx-auto mt-16 max-w-3xl border-t border-slate-200 px-4 py-8 text-xs text-slate-400">
          <p>
            Kein Shop — wir beobachten nur Verfügbarkeiten und verlinken zu den Händlern. Alle
            Angaben ohne Gewähr, Preise können abweichen.
          </p>
          <p className="mt-2">
            PLZ-Daten:{" "}
            <a className="underline" href="https://www.geonames.org/" rel="noopener">
              GeoNames
            </a>{" "}
            (CC BY 4.0)
          </p>
          <p className="mt-2 space-x-3">
            <Link className="underline" href="/impressum">
              Impressum
            </Link>
            <Link className="underline" href="/datenschutz">
              Datenschutz
            </Link>
          </p>
        </footer>
      </body>
    </html>
  );
}

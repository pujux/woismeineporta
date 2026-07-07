import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const BASE_URL = process.env.PUBLIC_BASE_URL ?? "http://localhost:3000";
const TITLE = "Wo is meine Porta? — Midea PortaSplit Verfügbarkeit Österreich";
const DESCRIPTION =
  "Live-Verfügbarkeit der Midea PortaSplit und PortaSplit Cool bei österreichischen Händlern — mit Sofort-Alarm per Push oder E-Mail, sobald sie wieder bestellbar ist.";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: TITLE,
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "de_AT",
    siteName: "Wo is meine Porta?",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0284c7" },
    { media: "(prefers-color-scheme: dark)", color: "#020617" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
        <footer className="mx-auto mt-16 max-w-3xl border-t border-slate-200 px-4 py-8 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <p>Kein Shop — wir beobachten nur Verfügbarkeiten und verlinken zu den Händlern. Alle Angaben ohne Gewähr, Preise können abweichen.</p>
          <p className="mt-2">
            PLZ-Daten:{" "}
            <a className="underline hover:text-slate-600 dark:hover:text-slate-300" href="https://www.geonames.org/" rel="noopener">
              GeoNames
            </a>{" "}
            (CC BY 4.0)
          </p>
          <p className="mt-2 space-x-3">
            <Link className="underline hover:text-slate-600 dark:hover:text-slate-300" href="/impressum">
              Impressum
            </Link>
            <Link className="underline hover:text-slate-600 dark:hover:text-slate-300" href="/datenschutz">
              Datenschutz
            </Link>
          </p>
        </footer>
      </body>
    </html>
  );
}

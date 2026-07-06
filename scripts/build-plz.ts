/**
 * Builds src/data/plz-at.json from the GeoNames Austrian postal code dump.
 * Data: https://download.geonames.org/export/zip/AT.zip — CC BY 4.0,
 * attribution required (see README / Datenschutz page).
 *
 * Run: pnpm tsx scripts/build-plz.ts
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const OUT = path.join(__dirname, "..", "src", "data", "plz-at.json");

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plz-at-"));
  const zipPath = path.join(tmp, "AT.zip");
  const res = await fetch("https://download.geonames.org/export/zip/AT.zip");
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
  execSync(`unzip -o ${zipPath} -d ${tmp}`, { stdio: "ignore" });

  // Tab-separated: country, zip, place, state, state code, ..., lat(9), lng(10), accuracy(11)
  const lines = fs.readFileSync(path.join(tmp, "AT.txt"), "utf8").trim().split("\n");
  const byZip = new Map<string, Array<[number, number]>>();
  for (const line of lines) {
    const cols = line.split("\t");
    const zip = cols[1];
    const lat = Number.parseFloat(cols[9]);
    const lng = Number.parseFloat(cols[10]);
    if (!zip || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (!byZip.has(zip)) byZip.set(zip, []);
    byZip.get(zip)!.push([lat, lng]);
  }

  const out: Record<string, [number, number]> = {};
  for (const [zip, coords] of [...byZip.entries()].sort()) {
    const lat = coords.reduce((a, c) => a + c[0], 0) / coords.length;
    const lng = coords.reduce((a, c) => a + c[1], 0) / coords.length;
    out[zip] = [Number(lat.toFixed(5)), Number(lng.toFixed(5))];
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(`wrote ${Object.keys(out).length} ZIP codes to ${OUT}`);
}

main();

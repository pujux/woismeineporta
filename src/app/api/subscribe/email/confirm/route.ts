import { getDb } from "@/db";
import { confirmEmail } from "@/lib/notify/email";
import { tinyPage } from "@/lib/tiny-page";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const ok = await confirmEmail(await getDb(), token);
  return tinyPage(
    ok ? "E-Mail bestätigt ✓" : "Link ungültig",
    ok
      ? "Dein PortaSplit-Alarm ist aktiv. Wir melden uns, sobald es was zu holen gibt!"
      : "Dieser Bestätigungslink ist abgelaufen oder wurde schon verwendet.",
    ok ? 200 : 404,
  );
}

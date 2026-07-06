import { getDb } from "@/db";
import { unsubscribeEmail } from "@/lib/notify/email";
import { tinyPage } from "@/lib/tiny-page";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const ok = await unsubscribeEmail(await getDb(), token);
  return tinyPage(
    ok ? "Abgemeldet ✓" : "Link ungültig",
    ok
      ? "Du bekommst keine PortaSplit-Alarme mehr. Schade — aber verständlich, wenn du schon eine ergattert hast. 😉"
      : "Dieser Abmeldelink ist ungültig oder wurde schon verwendet.",
    ok ? 200 : 404,
  );
}

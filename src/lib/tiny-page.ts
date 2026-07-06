/** Minimal German HTML response for confirm/unsubscribe endpoints. */
export function tinyPage(title: string, message: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — Wo ist meine Porta?</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f8fafc;color:#0f172a}
main{text-align:center;padding:2rem;max-width:28rem}h1{font-size:1.5rem}a{color:#0369a1}</style></head>
<body><main><h1>${title}</h1><p>${message}</p><p><a href="/">Zur Übersicht</a></p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

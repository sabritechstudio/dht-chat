export const config = { runtime: "edge" };

const ALLOWED_SUFFIXES = [".trycloudflare.com"];

function reply(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status: status,
    headers: { "Content-Type": "application/json", "X-DHT-Proxy": "1" },
  });
}

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  const extra = (process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix)) || extra.includes(host);
}

export default async function handler(request) {
  if (request.method !== "POST") {
    return reply(405, "Method not allowed");
  }

  const target = request.headers.get("x-dht-target") || process.env.OLLAMA_URL || "";

  let url;
  try {
    url = new URL(target);
  } catch (error) {
    return reply(400, "Invalid endpoint URL");
  }

  if (url.protocol !== "https:" || !isAllowedHost(url.hostname)) {
    return reply(403, "Endpoint host is not allowed");
  }

  const payload = await request.text();

  let upstream;
  try {
    upstream = await fetch(url.origin + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });
  } catch (error) {
    return reply(502, "Tunnel unreachable: " + String(error && error.message ? error.message : error));
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/x-ndjson",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
      "X-DHT-Proxy": "1",
    },
  });
}

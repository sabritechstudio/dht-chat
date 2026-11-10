export const config = { runtime: "edge" };

const ALLOWED_SUFFIXES = [".trycloudflare.com"];

function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS, POST",
    "Access-Control-Allow-Headers": "Content-Type, x-dht-target, Accept",
    "Access-Control-Allow-Credentials": "true",
    "x-dht-proxy": "1" // This lets script.js know the proxy is validated!
  };
}

function reply(status, message) {
  return new Response(JSON.stringify({ error: message }), {
    status: status,
    headers: { 
      ...getCorsHeaders(),
      "Content-Type": "application/json" 
    },
  });
}

function isAllowedHost(hostname) {
  const host = hostname.toLowerCase();
  // Safe extraction for Edge runtime environments
  return ALLOWED_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

export default async function handler(request) {
  // 1. Immediately return 200 for CORS preflight validation checks
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: getCorsHeaders(),
    });
  }

  if (request.method !== "POST") {
    return reply(405, "Method not allowed");
  }

  // 2. Safely grab the endpoint address from headers
  const target = request.headers.get("x-dht-target") || "";
  if (!target) {
    return reply(400, "Missing x-dht-target address header.");
  }

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

  try {
    // 3. Connect straight out to your local Ollama instance tunnel
    const upstream = await fetch(url.origin + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

    if (!upstream.ok) {
      return new Response(await upstream.text(), {
        status: upstream.status,
        headers: getCorsHeaders(),
      });
    }

    // 4. Clean stream pipeline return 
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        ...getCorsHeaders(),
        "Content-Type": upstream.headers.get("Content-Type") || "application/x-ndjson",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Accel-Buffering": "no",
      },
    });

  } catch (error) {
    return reply(502, "Tunnel unreachable: " + String(error.message || error));
  }
}

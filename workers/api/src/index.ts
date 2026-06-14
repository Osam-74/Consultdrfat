/**
 * MindBridge API — Cloudflare Worker
 *
 * Three endpoints, all the server-side trust the PWA needs:
 *   GET  /verify?reference=...  → confirm a Paystack transaction succeeded (NGN)
 *   POST /webhook               → Paystack webhook (HMAC-SHA512 verified)
 *   GET  /turn                  → short-lived Cloudflare TURN/STUN ICE servers
 *
 * Secrets (set with `wrangler secret put <NAME>`):
 *   PAYSTACK_SECRET_KEY   sk_live_… / sk_test_…
 *   CF_TURN_KEY_ID        Cloudflare Realtime TURN key id
 *   CF_TURN_API_TOKEN     Cloudflare Realtime TURN API token
 */

export interface Env {
  PAYSTACK_SECRET_KEY: string;
  CF_TURN_KEY_ID: string;
  CF_TURN_API_TOKEN: string;
  ALLOW_ORIGIN: string; // e.g. https://yourapp.pages.dev
}

const cors = (origin: string) => ({
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});

function json(data: unknown, env: Env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(env.ALLOW_ORIGIN) },
  });
}

async function hmacSHA512Hex(key: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { headers: cors(env.ALLOW_ORIGIN) });

    // ── Verify a Paystack transaction ──
    if (url.pathname === "/verify" && req.method === "GET") {
      const reference = url.searchParams.get("reference");
      if (!reference) return json({ ok: false, error: "missing reference" }, env, 400);
      const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` },
      });
      const data = (await r.json()) as { data?: { status?: string; amount?: number; currency?: string } };
      const ok = data?.data?.status === "success";
      return json({ ok, amount: data?.data?.amount, currency: data?.data?.currency, reference }, env, ok ? 200 : 402);
    }

    // ── Paystack webhook (verify signature, then act) ──
    if (url.pathname === "/webhook" && req.method === "POST") {
      const body = await req.text();
      const signature = req.headers.get("x-paystack-signature") || "";
      const expected = await hmacSHA512Hex(env.PAYSTACK_SECRET_KEY, body);
      if (signature !== expected) return new Response("invalid signature", { status: 401 });
      // const event = JSON.parse(body);  // e.g. event.event === "charge.success"
      // TODO: mark the booking/extension paid in Firestore via the Admin REST API
      //       using event.data.reference and event.data.metadata.bookingId.
      return new Response("ok", { status: 200 });
    }

    // ── Cloudflare TURN/STUN ICE servers (short-lived credentials) ──
    if (url.pathname === "/turn" && req.method === "GET") {
      const fallback = { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] };
      if (!env.CF_TURN_KEY_ID || !env.CF_TURN_API_TOKEN) return json(fallback, env);
      const r = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${env.CF_TURN_KEY_ID}/credentials/generate`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${env.CF_TURN_API_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ttl: 86400 }),
        }
      );
      const data = (await r.json()) as { iceServers?: unknown };
      // Cloudflare returns a single iceServers object; the browser expects an array.
      const iceServers = data?.iceServers ? [data.iceServers] : fallback.iceServers;
      return json({ iceServers }, env);
    }

    return new Response("Not found", { status: 404, headers: cors(env.ALLOW_ORIGIN) });
  },
};

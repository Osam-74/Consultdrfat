/**
 * ConsultDrFat API — Cloudflare Worker
 *
 * Endpoints:
 *   GET  /verify?reference=...  → confirm a Paystack transaction succeeded (NGN)
 *   POST /webhook               → Paystack webhook (HMAC-SHA512 verified) → marks booking paid in Firestore
 *   GET  /turn                  → short-lived Cloudflare TURN/STUN ICE servers
 *   GET  /health                → simple health check
 *
 * Secrets (set with `wrangler secret put <NAME>`):
 *   PAYSTACK_SECRET_KEY   sk_live_… / sk_test_…
 *   CF_TURN_KEY_ID        Cloudflare Realtime TURN key id
 *   CF_TURN_API_TOKEN     Cloudflare Realtime TURN API token
 *   FIREBASE_PROJECT_ID   e.g. consultdrfat
 *   FIREBASE_SA_JSON      Full service-account JSON (for Admin REST API auth)
 *                         → Firebase console → Project Settings → Service Accounts → Generate new private key
 */

export interface Env {
  PAYSTACK_SECRET_KEY: string;
  CF_TURN_KEY_ID: string;
  CF_TURN_API_TOKEN: string;
  ALLOW_ORIGIN: string;        // e.g. https://consultdrfat.pages.dev
  FIREBASE_PROJECT_ID: string; // e.g. consultdrfat
  FIREBASE_SA_JSON: string;    // full service-account JSON string
}

// ─── CORS helpers ───────────────────────────────────────────────────────────

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

// ─── HMAC-SHA512 ─────────────────────────────────────────────────────────────

async function hmacSHA512Hex(key: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw", enc.encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Firebase Admin via REST API ─────────────────────────────────────────────
// We mint a short-lived Google OAuth2 access token from a service-account JWT
// (RS256), then use the Firestore REST API to update documents.

async function getFirebaseAccessToken(saJson: string): Promise<string> {
  let sa: { client_email: string; private_key: string };
  try {
    sa = JSON.parse(saJson);
  } catch {
    throw new Error("FIREBASE_SA_JSON is not valid JSON");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore",
  };

  const b64url = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const signingInput = `${b64url(header)}.${b64url(payload)}`;

  // Import the RSA private key
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", keyBytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(signingInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

  const jwt = `${signingInput}.${sigB64}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
  if (!tokenData.access_token) throw new Error(`Token error: ${tokenData.error}`);
  return tokenData.access_token;
}

/**
 * Mark a Firestore document field using the REST PATCH API.
 * path: e.g. "bookings/ABC123"
 */
async function firestorePatch(
  projectId: string,
  accessToken: string,
  path: string,
  fields: Record<string, unknown>
): Promise<void> {
  // Build Firestore value objects
  const toFsValue = (v: unknown): unknown => {
    if (typeof v === "string") return { stringValue: v };
    if (typeof v === "number") return { integerValue: String(v) };
    if (typeof v === "boolean") return { booleanValue: v };
    if (v === null) return { nullValue: null };
    return { stringValue: String(v) };
  };

  const fsFields: Record<string, unknown> = {};
  const updateMask: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    fsFields[k] = toFsValue(v);
    updateMask.push(k);
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}?updateMask.fieldPaths=${updateMask.join("&updateMask.fieldPaths=")}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: fsFields }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore PATCH failed: ${res.status} ${err}`);
  }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors(env.ALLOW_ORIGIN) });
    }

    // ── Health check ──────────────────────────────────────────────────────────
    if (url.pathname === "/health" && req.method === "GET") {
      return json({ ok: true, ts: Date.now() }, env);
    }

    // ── Verify a Paystack transaction ─────────────────────────────────────────
    if (url.pathname === "/verify" && req.method === "GET") {
      const reference = url.searchParams.get("reference");
      if (!reference) return json({ ok: false, error: "missing reference" }, env, 400);

      const r = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } }
      );
      const data = (await r.json()) as {
        data?: { status?: string; amount?: number; currency?: string };
      };
      const ok = data?.data?.status === "success";
      return json(
        { ok, amount: data?.data?.amount, currency: data?.data?.currency, reference },
        env, ok ? 200 : 402
      );
    }

    // ── Paystack webhook → mark booking paid in Firestore ─────────────────────
    if (url.pathname === "/webhook" && req.method === "POST") {
      const body = await req.text();

      // 1. Verify HMAC signature
      const signature = req.headers.get("x-paystack-signature") || "";
      const expected = await hmacSHA512Hex(env.PAYSTACK_SECRET_KEY, body);
      if (signature !== expected) {
        return new Response("invalid signature", { status: 401 });
      }

      // 2. Parse event
      let event: {
        event?: string;
        data?: {
          reference?: string;
          status?: string;
          metadata?: { bookingId?: string; kind?: string; minutes?: number };
        };
      };
      try {
        event = JSON.parse(body);
      } catch {
        return new Response("bad json", { status: 400 });
      }

      // 3. Act on charge.success
      if (event.event === "charge.success" && event.data?.status === "success") {
        const reference = event.data.reference ?? "";
        const bookingId = event.data.metadata?.bookingId ?? "";
        const kind = event.data.metadata?.kind ?? "session"; // "session" | "extension"

        if (bookingId && env.FIREBASE_SA_JSON && env.FIREBASE_PROJECT_ID) {
          try {
            const token = await getFirebaseAccessToken(env.FIREBASE_SA_JSON);

            if (kind === "extension") {
              // Mark the extension offer as confirmed in the session doc
              await firestorePatch(env.FIREBASE_PROJECT_ID, token, `sessions/${bookingId}`, {
                "offer.status": "confirmed",
                "offer.paystackRef": reference,
              });
            } else {
              // Mark the booking as paid
              await firestorePatch(env.FIREBASE_PROJECT_ID, token, `bookings/${bookingId}`, {
                status: "paid",
                paystackRef: reference,
              });
            }
          } catch (err) {
            // Log but still return 200 so Paystack doesn't retry endlessly
            console.error("Firestore update failed:", err);
          }
        }
      }

      return new Response("ok", { status: 200 });
    }

    // ── Cloudflare TURN/STUN ICE servers ──────────────────────────────────────
    if (url.pathname === "/turn" && req.method === "GET") {
      const fallback = { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] };
      if (!env.CF_TURN_KEY_ID || !env.CF_TURN_API_TOKEN) return json(fallback, env);

      const r = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${env.CF_TURN_KEY_ID}/credentials/generate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.CF_TURN_API_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ttl: 86400 }),
        }
      );
      const data = (await r.json()) as { iceServers?: unknown };
      const iceServers = data?.iceServers ? [data.iceServers] : fallback.iceServers;
      return json({ iceServers }, env);
    }

    return new Response("Not found", { status: 404, headers: cors(env.ALLOW_ORIGIN) });
  },
};

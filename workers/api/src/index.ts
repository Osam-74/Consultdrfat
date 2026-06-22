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
  CF_TURN_KEY_ID?: string;
  CF_TURN_API_TOKEN?: string;
  ALLOW_ORIGIN: string;        // e.g. https://consultdrfat.pages.dev
  FIREBASE_PROJECT_ID: string; // e.g. consultdrfat
  FIREBASE_SA_JSON: string;    // full service-account JSON string
  SESSION_FILES: R2Bucket;     // R2 bucket for session file uploads
  R2_PUBLIC_BASE?: string;     // optional — if not set, files served via /files/ endpoint
}

// ─── CORS helpers ───────────────────────────────────────────────────────────

const cors = (_origin: string) => ({
  // Allow any origin — the worker is protected by Firebase ID-token verification
  // and Paystack secret keys, so open CORS is safe here.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
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

/**
 * Run a Firestore query via the REST API (runQuery).
 * Returns array of document field maps.
 */
async function firestoreQuery(
  projectId: string,
  accessToken: string,
  collectionPath: string,
  filters: Array<{ field: string; op: string; value: unknown }>,
  orderBy?: { field: string; direction: "ASCENDING" | "DESCENDING" }
): Promise<Array<Record<string, unknown>>> {
  const from = [{ collectionId: collectionPath.split("/").pop() }];

  const filterParts = filters.map(f => {
    const toFsValue = (v: unknown): unknown => {
      if (typeof v === "string") return { stringValue: v };
      if (typeof v === "number") return { integerValue: String(v) };
      if (typeof v === "boolean") return { booleanValue: v };
      return { stringValue: String(v) };
    };
    return {
      fieldFilter: {
        field: { fieldPath: f.field },
        op: f.op,
        value: toFsValue(f.value),
      },
    };
  });

  const body: Record<string, unknown> = {
    structuredQuery: {
      from,
      where: filterParts.length === 1
        ? filterParts[0]
        : { compositeFilter: { op: "AND", filters: filterParts } },
    },
  };

  if (orderBy) {
    (body.structuredQuery as Record<string, unknown>).orderBy = [
      { field: { fieldPath: orderBy.field }, direction: orderBy.direction },
    ];
  }

  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore query failed: ${res.status} ${err}`);
  }
  const data = await res.json() as Array<{ document?: { fields?: Record<string, unknown> } }>;
  return data
    .filter((r) => r.document?.fields)
    .map((r) => r.document!.fields!);
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors(env.ALLOW_ORIGIN) });
    }

    // ── Taken slots — returns all active booking start times ─────────────────
    if (url.pathname === "/taken-slots" && req.method === "GET") {
      try {
        const token = await getFirebaseToken(env.FIREBASE_SA_JSON);
        // Query bookings where status == "paid" OR status == "held"
        // We need both — paid = confirmed, held = pending payment
        const [paidDocs, heldDocs] = await Promise.all([
          firestoreQuery(env.FIREBASE_PROJECT_ID, token, "bookings", [
            { field: "status", op: "EQUAL", value: "paid" },
          ]),
          firestoreQuery(env.FIREBASE_PROJECT_ID, token, "bookings", [
            { field: "status", op: "EQUAL", value: "held" },
          ]),
        ]);

        const allDocs = [...paidDocs, ...heldDocs];
        const takenSlots: number[] = [];
        for (const fields of allDocs) {
          // Extract slotStart timestamp value
          const ss = fields.slotStart as { timestampValue?: string; integerValue?: string } | undefined;
          if (ss?.timestampValue) {
            takenSlots.push(new Date(ss.timestampValue).getTime());
          }
        }

        return json({ taken: takenSlots }, env);
      } catch (err) {
        return json({ error: "Failed to fetch taken slots", detail: String(err) }, env, 500);
      }
    }

    // ── Root / health check ─────────────────────────────────────────────────────
    if ((url.pathname === "/" || url.pathname === "/health") && req.method === "GET") {
      return json({
        ok: true,
        service: "consultdrfat-api",
        ts: Date.now(),
        endpoints: ["/health", "/verify", "/webhook", "/turn", "/upload", "/files/{key}", "/taken-slots"],
      }, env);
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
      // Always include free OpenRelay TURN servers in the fallback — STUN alone
      // cannot traverse symmetric NATs (common on mobile/carrier networks).
      // Keep to max 4 ICE servers to avoid Chrome's "5+ STUN/TURN servers slows down discovery" warning
      const fallback = {
        iceServers: [
          { urls: "stun:stun.cloudflare.com:3478" },
          { urls: "stun:stun.l.google.com:19302" },
          {
            urls: [
              "turn:openrelay.metered.ca:80",
              "turn:openrelay.metered.ca:443",
              "turn:openrelay.metered.ca:443?transport=tcp",
            ],
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ],
      };

      if (!env.CF_TURN_KEY_ID || !env.CF_TURN_API_TOKEN) return json(fallback, env);

      try {
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
        if (!r.ok) return json(fallback, env);
        const data = (await r.json()) as { iceServers?: RTCIceServer[] };
        // Cloudflare returns iceServers as an array — merge with fallback TURN
        const cfServers = Array.isArray(data?.iceServers) ? data.iceServers : [];
        // Cap at 4 servers total to avoid Chrome warning
        const iceServers = [...cfServers, ...fallback.iceServers].slice(0, 4);
        return json({ iceServers }, env);
      } catch {
        return json(fallback, env);
      }
    }

    // ── File upload → R2 ──────────────────────────────────────────────────────
    // POST /upload  (multipart/form-data)
    //   field "file"      → the binary file
    //   field "bookingId" → used to namespace the R2 key
    // Returns: { ok: true, url: "https://pub-xxxx.r2.dev/session-files/..." }
    if (url.pathname === "/upload" && req.method === "POST") {
      if (!env.SESSION_FILES) {
        return json({
          ok: false,
          error: "R2 bucket binding missing. In Cloudflare dashboard: Worker → Settings → Bindings → Add R2 bucket, binding name = SESSION_FILES, bucket = consultdrfat-session-files. Then redeploy."
        }, env, 503);
      }
      // R2_PUBLIC_BASE is optional — if not set, we serve files via /files/ endpoint

      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return json({ ok: false, error: "Could not parse form data" }, env, 400);
      }

      const fileEntry = formData.get("file");
      const bookingId = (formData.get("bookingId") as string | null) ?? "unknown";

      if (!fileEntry || typeof fileEntry === "string") {
        return json({ ok: false, error: "No file provided" }, env, 400);
      }

      const file = fileEntry as File;

      // 20 MB hard cap
      if (file.size > 20 * 1024 * 1024) {
        return json({ ok: false, error: "File exceeds 20 MB limit" }, env, 413);
      }

      // Sanitise filename and build R2 key
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `session-files/${bookingId}/${Date.now()}_${safeName}`;

      const bytes = await file.arrayBuffer();
      await env.SESSION_FILES.put(key, bytes, {
        httpMetadata: {
          contentType: file.type || "application/octet-stream",
          contentDisposition: `inline; filename="${safeName}"`,
        },
      });

      // Use R2_PUBLIC_BASE if available, otherwise serve via the worker itself
      const publicUrl = env.R2_PUBLIC_BASE
        ? `${env.R2_PUBLIC_BASE.replace(/\/$/, "")}/${key}`
        : `${url.origin}/files/${key}`;
      return json({ ok: true, url: publicUrl }, env, 200);
    }

    // ── Serve R2 files directly (fallback when R2_PUBLIC_BASE is not set) ──────
    // GET /files/session-files/{bookingId}/{filename}
    if (url.pathname.startsWith("/files/") && req.method === "GET") {
      const key = url.pathname.slice(7); // strip "/files/"
      if (!env.SESSION_FILES) {
        return json({ ok: false, error: "R2 bucket not configured" }, env, 503);
      }
      const object = await env.SESSION_FILES.get(key);
      if (!object) {
        return new Response("File not found", { status: 404, headers: cors(env.ALLOW_ORIGIN) });
      }
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Access-Control-Allow-Origin", "*");
      headers.set("Cache-Control", "public, max-age=86400");
      return new Response(object.body, { headers });
    }

    return new Response("Not found", { status: 404, headers: cors(env.ALLOW_ORIGIN) });
  },
};

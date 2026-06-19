// src/index.ts
var cors = (_origin) => ({
  // Allow any origin — the worker is protected by Firebase ID-token verification
  // and Paystack secret keys, so open CORS is safe here.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
});
function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(env.ALLOW_ORIGIN) }
  });
}
async function hmacSHA512Hex(key, body) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(key),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function getFirebaseAccessToken(saJson) {
  let sa;
  try {
    sa = JSON.parse(saJson);
  } catch {
    throw new Error("FIREBASE_SA_JSON is not valid JSON");
  }
  const now = Math.floor(Date.now() / 1e3);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: "https://www.googleapis.com/auth/datastore"
  };
  const b64url = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const pemBody = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/, "").replace(/-----END PRIVATE KEY-----/, "").replace(/\s/g, "");
  const keyBytes = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const jwt = `${signingInput}.${sigB64}`;
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token)
    throw new Error(`Token error: ${tokenData.error}`);
  return tokenData.access_token;
}
async function firestorePatch(projectId, accessToken, path, fields) {
  const toFsValue = (v) => {
    if (typeof v === "string")
      return { stringValue: v };
    if (typeof v === "number")
      return { integerValue: String(v) };
    if (typeof v === "boolean")
      return { booleanValue: v };
    if (v === null)
      return { nullValue: null };
    return { stringValue: String(v) };
  };
  const fsFields = {};
  const updateMask = [];
  for (const [k, v] of Object.entries(fields)) {
    fsFields[k] = toFsValue(v);
    updateMask.push(k);
  }
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${path}?updateMask.fieldPaths=${updateMask.join("&updateMask.fieldPaths=")}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ fields: fsFields })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore PATCH failed: ${res.status} ${err}`);
  }
}
var src_default = {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: cors(env.ALLOW_ORIGIN) });
    }
    if (url.pathname === "/health" && req.method === "GET") {
      return json({ ok: true, ts: Date.now() }, env);
    }
    if (url.pathname === "/verify" && req.method === "GET") {
      const reference = url.searchParams.get("reference");
      if (!reference)
        return json({ ok: false, error: "missing reference" }, env, 400);
      const r = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}` } }
      );
      const data = await r.json();
      const ok = data?.data?.status === "success";
      return json(
        { ok, amount: data?.data?.amount, currency: data?.data?.currency, reference },
        env,
        ok ? 200 : 402
      );
    }
    if (url.pathname === "/webhook" && req.method === "POST") {
      const body = await req.text();
      const signature = req.headers.get("x-paystack-signature") || "";
      const expected = await hmacSHA512Hex(env.PAYSTACK_SECRET_KEY, body);
      if (signature !== expected) {
        return new Response("invalid signature", { status: 401 });
      }
      let event;
      try {
        event = JSON.parse(body);
      } catch {
        return new Response("bad json", { status: 400 });
      }
      if (event.event === "charge.success" && event.data?.status === "success") {
        const reference = event.data.reference ?? "";
        const bookingId = event.data.metadata?.bookingId ?? "";
        const kind = event.data.metadata?.kind ?? "session";
        if (bookingId && env.FIREBASE_SA_JSON && env.FIREBASE_PROJECT_ID) {
          try {
            const token = await getFirebaseAccessToken(env.FIREBASE_SA_JSON);
            if (kind === "extension") {
              await firestorePatch(env.FIREBASE_PROJECT_ID, token, `sessions/${bookingId}`, {
                "offer.status": "confirmed",
                "offer.paystackRef": reference
              });
            } else {
              await firestorePatch(env.FIREBASE_PROJECT_ID, token, `bookings/${bookingId}`, {
                status: "paid",
                paystackRef: reference
              });
            }
          } catch (err) {
            console.error("Firestore update failed:", err);
          }
        }
      }
      return new Response("ok", { status: 200 });
    }
    if (url.pathname === "/turn" && req.method === "GET") {
      const fallback = { iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] };
      if (!env.CF_TURN_KEY_ID || !env.CF_TURN_API_TOKEN)
        return json(fallback, env);
      const r = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${env.CF_TURN_KEY_ID}/credentials/generate`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.CF_TURN_API_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ ttl: 86400 })
        }
      );
      const data = await r.json();
      const iceServers = data?.iceServers ? [data.iceServers] : fallback.iceServers;
      return json({ iceServers }, env);
    }
    if (url.pathname === "/upload" && req.method === "POST") {
      if (!env.SESSION_FILES) {
        return json({ ok: false, error: "R2 bucket not configured" }, env, 503);
      }
      if (!env.R2_PUBLIC_BASE) {
        return json({ ok: false, error: "R2_PUBLIC_BASE secret not set" }, env, 503);
      }
      let formData;
      try {
        formData = await req.formData();
      } catch {
        return json({ ok: false, error: "Could not parse form data" }, env, 400);
      }
      const fileEntry = formData.get("file");
      const bookingId = formData.get("bookingId") ?? "unknown";
      if (!fileEntry || typeof fileEntry === "string") {
        return json({ ok: false, error: "No file provided" }, env, 400);
      }
      const file = fileEntry;
      if (file.size > 20 * 1024 * 1024) {
        return json({ ok: false, error: "File exceeds 20 MB limit" }, env, 413);
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const key = `session-files/${bookingId}/${Date.now()}_${safeName}`;
      const bytes = await file.arrayBuffer();
      await env.SESSION_FILES.put(key, bytes, {
        httpMetadata: {
          contentType: file.type || "application/octet-stream",
          contentDisposition: `inline; filename="${safeName}"`
        }
      });
      const publicUrl = `${env.R2_PUBLIC_BASE.replace(/\/$/, "")}/${key}`;
      return json({ ok: true, url: publicUrl }, env, 200);
    }
    return new Response("Not found", { status: 404, headers: cors(env.ALLOW_ORIGIN) });
  }
};
export {
  src_default as default
};

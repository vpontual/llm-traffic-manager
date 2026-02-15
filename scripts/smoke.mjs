import { setTimeout as delay } from "node:timers/promises";

const baseUrl = (process.env.BASE_URL || "http://localhost:3334").replace(/\/$/, "");
const proxyUrl = (process.env.PROXY_URL || "http://localhost:11434").replace(/\/$/, "");
const smokeUsername = process.env.SMOKE_USERNAME || process.env.ADMIN_USERNAME || "smoke-admin";
const smokePassword = process.env.SMOKE_PASSWORD || process.env.ADMIN_PASSWORD || "smoke-password";

function ensureOk(path, res) {
  if (!res.ok) {
    throw new Error(`${path} returned ${res.status}`);
  }
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text().catch(() => "");
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

async function waitForApp(path = "/api/auth/me", timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { res } = await fetchJson(`${baseUrl}${path}`);
      if (res.status < 500) return;
    } catch {
      // Not up yet
    }
    await delay(2_000);
  }
  throw new Error(`Timed out waiting for ${baseUrl}${path}`);
}

function extractSessionCookie(setCookieHeader) {
  if (!setCookieHeader) return null;
  const match = setCookieHeader.match(/fleet_session=[^;]+/i);
  return match ? match[0] : null;
}

async function acquireSession(needsSetup) {
  if (needsSetup) {
    const { res, json } = await fetchJson(`${baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username: smokeUsername, password: smokePassword }),
    });
    ensureOk("/api/auth/setup", res);
    if (!json?.user) {
      throw new Error("Setup succeeded but no user returned");
    }
    const cookie = extractSessionCookie(res.headers.get("set-cookie"));
    if (!cookie) throw new Error("Setup did not return session cookie");
    console.log(`✔ setup created user ${json.user.username}`);
    return cookie;
  }

  if (!process.env.SMOKE_USERNAME && !process.env.ADMIN_USERNAME) {
    console.log("↷ setup already complete; skipping login (no SMOKE_USERNAME/ADMIN_USERNAME provided)");
    return null;
  }

  const { res, json } = await fetchJson(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ username: smokeUsername, password: smokePassword }),
  });
  ensureOk("/api/auth/login", res);
  if (!json?.user) {
    throw new Error("Login succeeded but no user returned");
  }
  const cookie = extractSessionCookie(res.headers.get("set-cookie"));
  if (!cookie) throw new Error("Login did not return session cookie");
  console.log(`✔ login for user ${json.user.username}`);
  return cookie;
}

async function run() {
  console.log(`Smoke base URL: ${baseUrl}`);
  console.log(`Proxy URL: ${proxyUrl}`);

  await waitForApp();
  console.log("✔ app is reachable");

  const { res: loginPageRes } = await fetchJson(`${baseUrl}/login`, {
    headers: { accept: "text/html" },
  });
  ensureOk("/login", loginPageRes);
  console.log("✔ /login");

  const { res: unauthServersRes } = await fetchJson(`${baseUrl}/api/servers`);
  if (unauthServersRes.status !== 401) {
    throw new Error(`/api/servers without cookie returned ${unauthServersRes.status} (expected 401)`);
  }
  console.log("✔ /api/servers rejects unauthenticated request");

  const { res: meRes, json: meJson } = await fetchJson(`${baseUrl}/api/auth/me`);
  if (meRes.status !== 200 && meRes.status !== 401) {
    throw new Error(`/api/auth/me returned ${meRes.status}`);
  }

  const needsSetup = Boolean(meJson?.needsSetup);
  console.log(`✔ /api/auth/me (needsSetup=${needsSetup})`);

  const sessionCookie = await acquireSession(needsSetup);

  if (sessionCookie) {
    const authHeaders = { cookie: sessionCookie, accept: "application/json" };

    const { res: authMeRes, json: authMeJson } = await fetchJson(`${baseUrl}/api/auth/me`, {
      headers: authHeaders,
    });
    ensureOk("/api/auth/me (authed)", authMeRes);
    if (!authMeJson?.user?.username) {
      throw new Error("Authenticated /api/auth/me did not return user details");
    }
    console.log("✔ authenticated /api/auth/me");

    const { res: serversRes, json: serversJson } = await fetchJson(`${baseUrl}/api/servers`, {
      headers: authHeaders,
    });
    ensureOk("/api/servers (authed)", serversRes);
    if (!Array.isArray(serversJson)) {
      throw new Error("/api/servers did not return an array");
    }
    console.log("✔ authenticated /api/servers");

    const { res: pollRes, json: pollJson } = await fetchJson(`${baseUrl}/api/poll`, {
      method: "POST",
      headers: authHeaders,
    });
    ensureOk("/api/poll", pollRes);
    if (pollJson?.ok !== true) {
      throw new Error("/api/poll did not return { ok: true }");
    }
    console.log("✔ authenticated /api/poll");

    const { res: logoutRes } = await fetchJson(`${baseUrl}/api/auth/logout`, {
      method: "POST",
      headers: authHeaders,
    });
    ensureOk("/api/auth/logout", logoutRes);
    console.log("✔ /api/auth/logout");
  }

  const proxyHealthRes = await fetch(`${proxyUrl}/`, { headers: { accept: "text/plain" } });
  ensureOk("proxy /", proxyHealthRes);
  const proxyHealthText = await proxyHealthRes.text();
  if (!proxyHealthText.includes("Ollama is running")) {
    throw new Error("Proxy health body mismatch");
  }
  console.log("✔ proxy health");

  const proxyTagsRes = await fetch(`${proxyUrl}/api/tags`, {
    headers: { accept: "application/json" },
  });
  ensureOk("proxy /api/tags", proxyTagsRes);
  const proxyTags = await proxyTagsRes.json().catch(() => null);
  if (!proxyTags || !Array.isArray(proxyTags.models)) {
    throw new Error("proxy /api/tags did not return { models: [] } shape");
  }
  console.log("✔ proxy /api/tags");

  console.log("Smoke test passed");
}

run().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});

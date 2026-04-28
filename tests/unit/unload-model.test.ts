import assert from "node:assert/strict";
import test from "node:test";
import { unloadModel } from "../../src/lib/ollama";

function mockFetch(impl: (url: string, opts?: unknown) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = impl as typeof globalThis.fetch;
  return () => { globalThis.fetch = original; };
}

test("unloadModel returns ok=true with status on 200", async () => {
  const restore = mockFetch(async () => new Response("", { status: 200 }));
  try {
    const r = await unloadModel("host:1", "m");
    assert.equal(r.ok, true);
    assert.equal(r.status, 200);
  } finally {
    restore();
  }
});

test("unloadModel returns ok=false with status and error body on non-2xx", async () => {
  const restore = mockFetch(async () => new Response("model is busy", { status: 503 }));
  try {
    const r = await unloadModel("host:1", "m");
    assert.equal(r.ok, false);
    assert.equal(r.status, 503);
    assert.match(r.error ?? "", /model is busy/);
  } finally {
    restore();
  }
});

test("unloadModel truncates long error bodies to 200 chars", async () => {
  const longBody = "x".repeat(5000);
  const restore = mockFetch(async () => new Response(longBody, { status: 500 }));
  try {
    const r = await unloadModel("host:1", "m");
    assert.equal(r.ok, false);
    assert.ok((r.error ?? "").length <= 200);
  } finally {
    restore();
  }
});

test("unloadModel returns ok=false with error on network failure", async () => {
  const restore = mockFetch(async () => { throw new Error("ECONNREFUSED"); });
  try {
    const r = await unloadModel("host:1", "m");
    assert.equal(r.ok, false);
    assert.equal(r.status, undefined);
    assert.match(r.error ?? "", /ECONNREFUSED/);
  } finally {
    restore();
  }
});

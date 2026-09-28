import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const scope = "https://example.invalid/flood/";

function fetchHandler(fetcher) {
  const listeners = {};
  const cached = { body: "older page" };
  const writes = [];
  const cache = {
    match: async () => cached,
    put: async (_request, response) => writes.push(response.body)
  };
  const sandbox = {
    URL, AbortController, setTimeout, clearTimeout,
    fetch: fetcher,
    Response: { error: () => ({ body: "network error" }) },
    caches: { open: async () => cache },
    self: {
      location: { origin: "https://example.invalid" },
      registration: { scope },
      addEventListener: (type, listener) => { listeners[type] = listener; }
    }
  };
  vm.runInNewContext(source, sandbox);
  return { listener: listeners.fetch, writes, cached };
}

test("online visit replaces a stale cached flood page", async () => {
  let requested = false;
  const fresh = { ok: true, body: "new page", clone() { return this; } };
  const { listener, writes } = fetchHandler(async (_request, options) => {
    requested = options.cache === "no-store";
    return fresh;
  });
  let result;
  listener({ request: { method: "GET", url: `${scope}index.html` }, respondWith: promise => { result = promise; } });
  assert.equal((await result).body, "new page");
  assert.equal(requested, true);
  assert.deepEqual(writes, ["new page"]);
});

test("offline visit falls back to the last cached flood page", async () => {
  const { listener, cached } = fetchHandler(async () => { throw new Error("offline"); });
  let result;
  listener({ request: { method: "GET", url: `${scope}index.html` }, respondWith: promise => { result = promise; } });
  assert.equal(await result, cached);
});

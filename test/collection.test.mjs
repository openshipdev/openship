import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import {
  isPublicAddress,
  checkedUrl,
  fetchResource,
} from "../lib/server/safe-fetch.js";
import { targets, failureState } from "../lib/server/collector.js";
import { readFile } from "node:fs/promises";
const discovery = JSON.parse(
  await readFile(
    new URL(
      "../skills/openship/references/examples/valid/discovery.json",
      import.meta.url,
    ),
  ),
);
test("server fetch denies non-public networks, including IPv6 and mapped IPv4", () => {
  for (const ip of [
    "127.0.0.1",
    "10.1.1.1",
    "169.254.169.254",
    "192.168.1.2",
    "172.16.1.2",
    "0.0.0.0",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "224.1.2.3",
    "100.64.0.1",
    "192.0.2.1",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("1.1.1.1"), true);
  assert.equal(isPublicAddress("2606:4700:4700::1111"), true);
});
test("server URL policy rejects credentials, insecure URLs and alternate ports", () => {
  for (const value of [
    "http://example.com",
    "https://u:p@example.com",
    "https://example.com:1234",
    "https://localhost",
    "https://service.internal",
  ])
    assert.throws(() => checkedUrl(value));
  assert.equal(
    checkedUrl("https://example.com/a").origin,
    "https://example.com",
  );
});
function transportFor(responses, seen) {
  return (url, options, callback) => {
    const req = new EventEmitter();
    req.destroy = (e) => {
      req.emit("error", e);
      req.emit("close");
    };
    process.nextTick(() => {
      options.lookup(url.hostname, {}, (err, address) => {
        assert.ifError(err);
        seen.push([url.href, address]);
      });
      const value = responses.shift();
      const res = Readable.from(value.chunks || [Buffer.from("{}")]);
      res.statusCode = value.status || 200;
      res.headers = value.headers || {};
      callback(res);
      res.on("end", () => req.emit("close"));
      res.on("close", () => req.emit("close"));
    });
    return req;
  };
}
test("redirect destination is re-resolved and private addresses are blocked before connecting", async () => {
  const seen = [];
  await assert.rejects(
    fetchResource("https://public.example", {
      resolve: async (host) => [
        {
          address: host === "public.example" ? "1.1.1.1" : "127.0.0.1",
          family: 4,
        },
      ],
      transport: transportFor(
        [{ status: 302, headers: { location: "https://private.example/x" } }],
        seen,
      ),
    }),
    /Non-public/,
  );
  assert.deepEqual(seen, [["https://public.example/", "1.1.1.1"]]);
});
test("transport pins checked DNS address and enforces streamed byte limit", async () => {
  const seen = [];
  const resolve = async () => [{ address: "1.1.1.1", family: 4 }];
  const result = await fetchResource("https://public.example", {
    resolve,
    transport: transportFor([{}], seen),
  });
  assert.equal(result.bytes.toString(), "{}");
  assert.equal(seen[0][1], "1.1.1.1");
  await assert.rejects(
    fetchResource("https://public.example", {
      resolve,
      maxBytes: 2,
      transport: transportFor([{ chunks: [Buffer.from("too big")] }], []),
    }),
    /limit/,
  );
});
test("mixed public/private DNS results are denied", async () => {
  await assert.rejects(
    fetchResource("https://public.example", {
      resolve: async () => [
        { address: "1.1.1.1", family: 4 },
        { address: "10.0.0.1", family: 4 },
      ],
      transport: () => {
        throw Error("must not connect");
      },
    }),
    /Non-public/,
  );
});
test("capture only follows explicitly advertised read-only endpoints", () => {
  const selected = targets(discovery, "https://example.com");
  assert(selected.some((r) => r.kind === "manifest"));
  assert(!selected.some((r) => /submit|mcp|status/.test(r.kind)));
});
test("missing requires three separate daily discovery checks; timeout resets missing streak", () => {
  let p = { missingCount: 0, failureCount: 0 };
  const missing = { discovery: true, status: 404 };
  const start = new Date("2026-09-10T00:00:00Z");
  p = { ...p, ...failureState(p, missing, start) };
  assert.equal(p.availability, "unreachable");
  p = { ...p, ...failureState(p, missing, new Date(+start + 1000)) };
  assert.equal(p.missingCount, 1);
  p = { ...p, ...failureState(p, missing, new Date(+start + 86400000)) };
  p = { ...p, ...failureState(p, missing, new Date(+start + 2 * 86400000)) };
  assert.equal(p.availability, "missing");
  assert.equal(failureState(p, { code: "timeout" }).missingCount, 0);
  assert.equal(failureState(p, { code: "validation" }).availability, "invalid");
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  composeChangesSubmission,
  computeSourcesDigest,
  decodeOpenShipBase64,
  diffSources,
  encodeOpenShipBase64,
  fetchOpenShip,
  matchOpenShipPattern,
  sha256Hex,
  validateDiscovery,
  validateChangesAccepted,
  validateChangesPolicy,
  validateChangesStatus,
  validateChangesSubmission,
  validateChangesViolation,
  validateSources,
  validateSystems,
} from "../src/index.js";

const fixtures = join(import.meta.dirname, "..", "dist", "skill", "references", "examples");
const json = async (...parts) => JSON.parse(await readFile(join(fixtures, ...parts), "utf8"));
const execFileAsync = promisify(execFile);

test("validates canonical discovery, sources, and systems fixtures", async () => {
  validateDiscovery(await json("valid", "discovery.json"));
  const verified = validateSources(
    await json("valid", "sources-manifest.json"),
    await json("valid", "sources-bundle.json"),
  );
  assert.equal(verified.files.length, 2);
  validateSystems(await json("valid", "systems.json"));
  validateChangesPolicy(await json("valid", "changes-policy.json"));
  validateChangesSubmission(await json("valid", "changes-submission.json"));
  validateChangesAccepted(await json("valid", "changes-accepted.json"));
  validateChangesStatus(await json("valid", "changes-status.json"));
  validateChangesViolation(await json("valid", "changes-violation.json"));
});

test("rejects invalid canonical fixtures", async () => {
  const invalidManifest = await json("invalid", "sources-manifest.json");
  const validBundle = await json("valid", "sources-bundle.json");
  const invalidSystems = await json("invalid", "systems.json");
  assert.throws(() => validateDiscovery({ openship: "2.0", capability: "discovery" }), /unsupported major version/);
  assert.throws(() => validateSources(invalidManifest, validBundle));
  assert.throws(() => validateSystems(invalidSystems));
});

test("uses the exact OpenShip pattern grammar", () => {
  assert.equal(matchOpenShipPattern("app/**", "app/page.tsx"), true);
  assert.equal(matchOpenShipPattern("app/**", "application.ts"), false);
  assert.equal(matchOpenShipPattern("app/page.tsx", "app/page.tsx"), true);
});

test("canonicalizes base64 and reports source diffs", async () => {
  const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
  assert.deepEqual(decodeOpenShipBase64(encodeOpenShipBase64(bytes)), bytes);
  assert.throws(() => decodeOpenShipBase64("%%%"));
  const manifest = await json("valid", "sources-manifest.json");
  const bundle = await json("valid", "sources-bundle.json");
  const verified = validateSources(manifest, bundle);
  assert.deepEqual(diffSources(verified, verified), []);
});

test("validates binary and symlink source entries", () => {
  const binary = new Uint8Array([0, 1, 2, 255]);
  const metadata = [
    { path: "assets/data.bin", size: 4, sha256: sha256Hex(binary), encoding: "base64", mediaType: "application/octet-stream", type: "file" },
    { path: "assets/link.bin", size: 4, sha256: sha256Hex(binary), encoding: "base64", mediaType: "application/octet-stream", type: "symlink", target: "assets/data.bin" },
  ];
  const digest = computeSourcesDigest(metadata);
  const manifest = { openship: "1.0", capability: "sources", digest, project: { name: "Binary", description: "Binary and symlink fixture." }, totals: { files: 2, bytes: 8 }, files: metadata };
  const content = encodeOpenShipBase64(binary);
  const bundle = { openship: "1.0", capability: "sources", digest, files: { "assets/data.bin": { encoding: "base64", content }, "assets/link.bin": { encoding: "base64", content } } };
  assert.equal(validateSources(manifest, bundle).decodedBytes, 8);
});

test("rejects graph cycles and accepts unknown members", async () => {
  const systems = await json("valid", "systems.json");
  systems.vendorExtension = { preserved: true };
  assert.equal(validateSystems(systems).vendorExtension.preserved, true);
  systems.system.nodes.push({ id: "p.worker", kind: "Process", name: "Worker", parentId: "h.runtime", metadata: { ownership: "first_party" } });
  systems.system.edges = [
    { id: "e.one", type: "Dataflow", fromNodeId: "p.web", toNodeId: "p.worker" },
    { id: "e.two", type: "Dataflow", fromNodeId: "p.worker", toNodeId: "p.web" },
  ];
  assert.throws(() => validateSystems(systems), /acyclic/);
});

test("requires typed ownership on every Systems node", async () => {
  const missing = await json("valid", "systems.json");
  delete missing.system.nodes[0].metadata.ownership;
  assert.throws(() => validateSystems(missing), /metadata\.ownership/);

  const invalid = await json("valid", "systems.json");
  invalid.system.nodes[0].metadata.ownership = "partner";
  assert.throws(() => validateSystems(invalid), /first_party or third_party/);
});

test("syncs and detects edits in the canonical skill", async () => {
  const directory = await mkdtemp(join(tmpdir(), "openship-skill-test-"));
  const destination = join(directory, "openship");
  const cli = join(import.meta.dirname, "..", "bin", "openship.mjs");
  try {
    await execFileAsync(process.execPath, [cli, "sync-skill", destination]);
    await execFileAsync(process.execPath, [cli, "verify-skill", destination]);
    await writeFile(join(destination, "SKILL.md"), "locally edited\n");
    await assert.rejects(execFileAsync(process.execPath, [cli, "verify-skill", destination]));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fetches the highest advertised capability", async () => {
  const discovery = await json("valid", "discovery.json");
  const systems = await json("valid", "systems.json");
  discovery.capabilities.systems = { document: "https://example.com/system.json" };
  const fetcher = async (url) => ({ ok: true, status: 200, json: async () => url.endsWith("system.json") ? systems : discovery });
  const result = await fetchOpenShip("https://example.com", { fetch: fetcher });
  assert.equal(result.snapshot.kind, "systems");
});

test("composes replacement and deletion patches", async () => {
  const manifest = await json("valid", "sources-manifest.json");
  const bundle = await json("valid", "sources-bundle.json");
  const base = validateSources(manifest, bundle);
  const currentManifest = structuredClone(manifest);
  const currentBundle = structuredClone(bundle);
  currentBundle.files["app/page.js"].content = "export default 'OpenShip'\n";
  const bytes = new TextEncoder().encode("export default 'OpenShip'\n");
  const crypto = await import("node:crypto");
  const readme = currentManifest.files.find((file) => file.path === "app/page.js");
  readme.size = bytes.length;
  readme.sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  currentManifest.totals.bytes = currentManifest.files.reduce((sum, file) => sum + file.size, 0);
  currentManifest.digest = `sha256:${crypto.createHash("sha256").update(currentManifest.files.map((file) => `${file.path}\0${file.sha256}\n`).join("")).digest("hex")}`;
  currentBundle.digest = currentManifest.digest;
  const current = validateSources(currentManifest, currentBundle);
  const patch = composeChangesSubmission(base, current, { title: "Update README", intent: "Clarify the project." });
  assert.equal(patch.files["app/page.js"].content, "export default 'OpenShip'\n");
});

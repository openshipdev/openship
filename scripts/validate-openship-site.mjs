import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { validateDiscovery, validateSources } from "../packages/protocol/src/index.js";
import { GET as getDiscovery } from "../app/.well-known/openship.json/route.js";
import { GET as getManifest } from "../app/openship/manifest.json/route.js";
import { GET as getBundle } from "../app/openship/bundle.json/route.js";

const origin = "https://openship.dev";
const responses = await Promise.all([
  getDiscovery(new Request(`${origin}/.well-known/openship.json`)),
  getManifest(),
  getBundle(),
]);

for (const response of responses) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
  assert.equal(response.headers.get("cache-control"), "public, max-age=0, must-revalidate");
  assert.match(response.headers.get("content-type"), /^application\/json/);
}

const [discovery, manifest, bundle] = await Promise.all(responses.map((response) => response.json()));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const name of ["discovery", "sources-manifest", "sources-bundle"]) {
  const schema = JSON.parse(
    await readFile(new URL(`../skills/openship/references/schemas/${name}.schema.json`, import.meta.url), "utf8"),
  );
  const validate = ajv.compile(schema);
  const value = name === "discovery" ? discovery : name === "sources-manifest" ? manifest : bundle;
  assert.equal(validate(value), true, `${name} schema errors: ${ajv.errorsText(validate.errors)}`);
}

validateDiscovery(discovery);
const verified = validateSources(manifest, bundle);

assert.deepEqual(Object.keys(discovery.capabilities), ["sources"]);
assert.deepEqual(Object.keys(discovery.capabilities.sources).sort(), ["bundle", "description", "manifest"]);
assert.equal(discovery.agent.skill, `${origin}/skill/SKILL.md`);
assert.match(discovery.agent.instructions, /read agent\.skill/i);
assert.equal(discovery.capabilities.sources.manifest, `${origin}/openship/manifest.json`);
assert.equal(discovery.capabilities.sources.bundle, `${origin}/openship/bundle.json`);
assert.equal(verified.files.length, manifest.totals.files);

process.stdout.write(`Validated website OpenShip Sources ${manifest.digest} (${verified.files.length} files)\n`);

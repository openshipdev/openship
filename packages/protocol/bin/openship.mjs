#!/usr/bin/env node

import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateChangesAccepted,
  validateChangesDocument,
  validateChangesPolicy,
  validateChangesStatus,
  validateChangesSubmission,
  validateChangesViolation,
  validateDiscovery,
  validateSources,
  validateSystems,
} from "../src/index.js";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const meta = JSON.parse(await readFile(join(packageRoot, "dist", "package-meta.json"), "utf8"));
const skillSource = join(packageRoot, "dist", "skill");

async function digestDirectory(root, excludes = new Set()) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else {
        const path = relative(root, absolute).split("\\").join("/");
        if (!excludes.has(path)) files.push(path);
      }
    }
  }
  await walk(root);
  files.sort();
  const records = [];
  for (const path of files) {
    const hash = createHash("sha256").update(await readFile(join(root, path))).digest("hex");
    records.push(`${path}\0${hash}\n`);
  }
  return { files, digest: `sha256:${createHash("sha256").update(records.join("")).digest("hex")}` };
}

const [command, rawDestination, ...rest] = process.argv.slice(2);
if (command === "sync-skill") {
  if (!rawDestination) throw new Error("Usage: openship sync-skill <destination>");
  const destination = resolve(rawDestination);
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  await cp(skillSource, destination, { recursive: true });
  const result = await digestDirectory(destination);
  await writeFile(join(destination, "UPSTREAM.json"), `${JSON.stringify({
    ...meta,
    packageDigest: result.digest,
    digestExcludes: ["UPSTREAM.json"],
  }, null, 2)}\n`);
  console.log(`OpenShip skill synchronized (${result.files.length} files, ${result.digest}).`);
} else if (command === "verify-skill") {
  if (!rawDestination) throw new Error("Usage: openship verify-skill <destination>");
  const destination = resolve(rawDestination);
  const provenance = JSON.parse(await readFile(join(destination, "UPSTREAM.json"), "utf8"));
  const result = await digestDirectory(destination, new Set(provenance.digestExcludes ?? []));
  const canonical = await digestDirectory(skillSource);
  if (
    provenance.package !== meta.package
    || provenance.packageVersion !== meta.packageVersion
    || provenance.sourceCommit !== meta.sourceCommit
    || provenance.packageDigest !== canonical.digest
    || result.digest !== canonical.digest
    || JSON.stringify(result.files) !== JSON.stringify(canonical.files)
  ) {
    throw new Error(`OpenShip skill mismatch. Expected ${provenance.packageDigest}; got ${result.digest}.`);
  }
  console.log(`OpenShip skill verified (${result.files.length} files, ${result.digest}).`);
} else if (command === "validate") {
  const paths = [rawDestination, ...rest].filter(Boolean);
  if (paths.length === 0) throw new Error("Usage: openship validate <document.json> [bundle.json]");
  const values = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(resolve(path), "utf8"))));
  const value = values[0];
  if (value.capability === "discovery") validateDiscovery(value);
  else if (value.capability === "systems") validateSystems(value);
  else if (value.capability === "sources") validateSources(value, values[1]);
  else if (value.capability === "changes") {
    if (value.files && value.title) validateChangesSubmission(value);
    else if (value.writable) validateChangesPolicy(value);
    else if (value.violations) validateChangesViolation(value);
    else if (value.statusUrl) validateChangesAccepted(value);
    else if (value.status) validateChangesStatus(value);
    else validateChangesDocument(value);
  }
  else throw new Error(`Unsupported capability ${String(value.capability)}.`);
  console.log("OpenShip document is valid.");
} else {
  throw new Error("Usage: openship <sync-skill|verify-skill|validate> ...");
}

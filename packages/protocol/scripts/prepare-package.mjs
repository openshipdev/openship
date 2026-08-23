#!/usr/bin/env node

import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const repositoryRoot = resolve(packageRoot, "..", "..");
const source = join(repositoryRoot, "skills", "openship");
const destination = join(packageRoot, "dist", "skill");
const packageJson = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));

let sourceCommit = null;
try {
  sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
} catch {
  // Source archives may not include Git metadata.
}

await rm(join(packageRoot, "dist"), { recursive: true, force: true });
await mkdir(join(packageRoot, "dist"), { recursive: true });
await cp(source, destination, { recursive: true });
await writeFile(
  join(packageRoot, "dist", "package-meta.json"),
  `${JSON.stringify({
    openship: "1.0",
    package: packageJson.name,
    packageVersion: packageJson.version,
    source: "https://github.com/openshipdev/openship/tree/main/skills/openship",
    sourceCommit,
  }, null, 2)}\n`,
);

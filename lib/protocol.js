import { readFile } from "node:fs/promises";
import path from "node:path";

export const documents = [
  {
    slug: "overview",
    title: "OpenShip",
    eyebrow: "Protocol overview",
    file: "openship.md",
    summary: "Discovery, shared conventions, and the Sources → Changes / Systems capability ladder.",
  },
  {
    slug: "sources",
    title: "Sources",
    eyebrow: "Capability 01 · Foundation",
    file: "openship-sources.md",
    summary: "Publish an exact, verifiable snapshot of a project’s declared source files.",
  },
  {
    slug: "changes",
    title: "Changes",
    eyebrow: "Capability 02 · Optional",
    file: "openship-changes.md",
    summary: "Propose replacement patches against an exact source digest and inspect the candidate result.",
  },
  {
    slug: "systems",
    title: "Systems",
    eyebrow: "Capability 03 · Advanced",
    file: "openship-systems.md",
    summary: "Describe source, runtime topology, context, dataflow, dependencies, and artifacts in one JSON document.",
  },
];

export const skillRoot = path.join(process.cwd(), "skills", "openship");
export const referencesRoot = path.join(skillRoot, "references");

export function getDocument(slug) {
  return documents.find((document) => document.slug === slug);
}

export function rawDocumentUrl(document) {
  return `/${document.file}`;
}

export async function readDocument(document) {
  return readFile(path.join(referencesRoot, document.file), "utf8");
}

export function headingId(value) {
  return value
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function extractSections(markdown) {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map((match) => ({
    title: match[1].replace(/[`*_]/g, ""),
    id: headingId(match[1]),
  }));
}

export function resolveDocHref(href) {
  if (!href || href.startsWith("http") || href.startsWith("#")) return href;
  const document = documents.find((item) => item.file === href);
  if (document) return `/docs/${document.slug}`;
  return `/skill/references/${href.replace(/^\.\//, "")}`;
}

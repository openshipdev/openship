import path from "node:path";
import { sourcesBundle } from "../../../lib/openship-sources.generated.js";

const contentTypes = {
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=0, must-revalidate",
};

const files = new Map();
const directories = new Map();
for (const [sourcePath, file] of Object.entries(sourcesBundle.files)) {
  if (!sourcePath.startsWith("skills/openship/")) continue;
  const relative = sourcePath.slice("skills/openship/".length);
  files.set(relative, file);
  const parts = relative.split("/");
  for (let index = 0; index < parts.length; index++) {
    const parent = parts.slice(0, index).join("/");
    if (!directories.has(parent)) directories.set(parent, new Map());
    directories.get(parent).set(parts[index], index === parts.length - 1 ? "file" : "directory");
  }
}

export async function GET(_request, { params }) {
  const { path: parts = [] } = await params;
  if (!parts.length || parts.some((part) => !part || part === "." || part === ".." || /[/\\\0]/.test(part))) {
    return new Response("Not found\n", { status: 404 });
  }
  const relative = parts.join("/");
  const entries = directories.get(relative);
  if (entries) {
    return Response.json(
      {
        openship: "1.0",
        package: "openship",
        path: relative,
        entries: [...entries].map(([name, type]) => ({
          name,
          type,
          href: `/skill/${relative}/${name}`,
        })).sort((left, right) => left.name.localeCompare(right.name)),
      },
      { headers },
    );
  }
  const file = files.get(relative);
  if (!file) return new Response("Not found\n", { status: 404 });
  return new Response(Buffer.from(file.content, file.encoding === "base64" ? "base64" : "utf8"), {
    headers: {
      ...headers,
      "Content-Type": contentTypes[path.extname(relative)] || "application/octet-stream",
    },
  });
}

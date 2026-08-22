import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { skillRoot } from "../../../lib/protocol";

const contentTypes = {
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function safePath(parts) {
  if (!parts.length || parts.some((part) => !part || part === "." || part === "..")) return null;
  const relative = parts.join("/");
  const resolved = path.resolve(skillRoot, relative);
  return resolved.startsWith(`${skillRoot}${path.sep}`) ? resolved : null;
}

export async function GET(_request, { params }) {
  const { path: parts = [] } = await params;
  const filePath = safePath(parts);
  if (!filePath) return new NextResponse("Not found\n", { status: 404 });

  try {
    const metadata = await stat(filePath);
    if (metadata.isDirectory()) {
      const entries = await readdir(filePath, { withFileTypes: true });
      const base = `/skill/${parts.join("/")}`;
      return NextResponse.json(
        {
          openship: "1.0",
          package: "openship",
          path: parts.join("/"),
          entries: entries
            .map((entry) => ({
              name: entry.name,
              type: entry.isDirectory() ? "directory" : "file",
              href: `${base}/${entry.name}`,
            }))
            .sort((left, right) => left.name.localeCompare(right.name)),
        },
        {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=0, must-revalidate",
          },
        },
      );
    }
    if (!metadata.isFile()) throw new Error("not a file");
    const content = await readFile(filePath);
    return new NextResponse(content, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=0, must-revalidate",
        "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      },
    });
  } catch {
    return new NextResponse("Not found\n", { status: 404 });
  }
}

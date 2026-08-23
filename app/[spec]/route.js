import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { documents, referencesRoot } from "../../lib/protocol";

const allowed = new Set(documents.map(({ file }) => file));

export async function GET(_request, { params }) {
  const { spec } = await params;
  if (!allowed.has(spec)) {
    return new NextResponse("Not found\n", { status: 404 });
  }
  const markdown = await readFile(path.join(referencesRoot, spec), "utf8");
  return new NextResponse(markdown, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=0, must-revalidate",
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}

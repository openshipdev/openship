import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET() {
  const skillPath = join(process.cwd(), "skills", "openship1", "SKILL.md");
  const markdown = await readFile(skillPath, "utf8");

  return new Response(markdown, {
    headers: {
      "content-type": "text/markdown; charset=utf-8",
    },
  });
}

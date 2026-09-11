import { permanentRedirect, notFound } from "next/navigation";
import { getDocument } from "../../../lib/protocol";
export default async function LegacyDoc({ params }) {
  const { slug } = await params;
  if (!getDocument(slug)) notFound();
  permanentRedirect(`/docs?topic=${encodeURIComponent(slug)}`);
}

import { notFound } from "next/navigation";
import OpenShipViewer from "../../../components/openship-viewer";
import { getOshSnapshot } from "../../../lib/server/osh";

export const metadata = {
  title: "Saved snapshot",
  description:
    "Explore the verified source and system design of a saved OpenShip snapshot.",
};

export default async function OshPage({ params }) {
  const { oshHash } = await params;
  const snapshot = await getOshSnapshot(oshHash.toLowerCase());
  if (!snapshot) notFound();
  return <OpenShipViewer key={oshHash} initialSnapshot={snapshot} />;
}

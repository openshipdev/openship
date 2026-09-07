import "./viewer.css";
import { SiteHeader, SiteFooter } from "../../components/site-shell";
import OpenShipViewer from "../../components/openship-viewer";

export const metadata = {
  title: "Source and system viewer",
  description: "Explore verified sources and structured system design directly from any public OpenShip provider.",
};

export default function ViewerPage() {
  return <><SiteHeader /><OpenShipViewer /><SiteFooter /></>;
}

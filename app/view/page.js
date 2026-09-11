import "./viewer.css";
import "@openship/graph/styles.css";
import { SiteHeader, SiteFooter } from "../../components/site-shell";
import OpenShipViewer from "../../components/openship-viewer";

export const metadata = {
  title: "View a project",
  description: "Explore verified sources and structured system design directly from any public OpenShip provider.",
};

export default function ViewerPage() {
  return <><SiteHeader /><OpenShipViewer /><SiteFooter /></>;
}

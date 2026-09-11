import "../../view/viewer.css";
import "@openship/graph/styles.css";
import "./skeleton.css";
import { SiteHeader, SiteFooter } from "../../../components/site-shell";

export default function OshLayout({ children }) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}

import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  metadataBase: new URL("https://openship.dev"),
  title: {
    default: "OpenShip — A public interface for running software",
    template: "%s · OpenShip",
  },
  description:
    "OpenShip lets running projects publish their source, accept isolated changes, and describe the system around them.",
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "OpenShip",
    description: "A public interface for running software.",
    type: "website",
    siteName: "OpenShip",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "OpenShip — A public interface for running software",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenShip",
    description: "A public interface for running software.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var s=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.setAttribute('data-theme',t==='light'||t==='dark'?t:s);}catch(e){}})();",
          }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  );
}

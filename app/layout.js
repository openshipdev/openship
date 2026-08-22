import "./globals.css";
import ThemeToggle from "./theme-toggle";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  metadataBase: new URL("https://openship.dev"),
  title: {
    default: "OpenShip — A protocol for inspectable projects",
    template: "%s · OpenShip",
  },
  description:
    "OpenShip is an open protocol for publishing verifiable source, proposing isolated changes, and describing running systems.",
  openGraph: {
    title: "OpenShip",
    description: "A running project should explain itself.",
    type: "website",
    siteName: "OpenShip",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "OpenShip protocol" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenShip",
    description: "A running project should explain itself.",
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
        <ThemeToggle />
        {children}
        <Analytics />
      </body>
    </html>
  );
}

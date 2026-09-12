import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  metadataBase: new URL("https://openship.dev"),
  title: {
    default: "OpenShip — See how a project works",
    template: "%s · OpenShip",
  },
  description:
    "Explore the source code and system design behind open software projects.",
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "OpenShip",
    description: "See how a project works.",
    type: "website",
    siteName: "OpenShip",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "OpenShip — See how a project works",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenShip",
    description: "See how a project works.",
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

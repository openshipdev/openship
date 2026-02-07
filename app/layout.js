import "./globals.css";
import ThemeToggle from "./theme-toggle";
import { Cormorant_Garamond, Gloock, Newsreader } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const gloock = Gloock({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["200", "300", "400"],
  variable: "--font-hero",
  display: "swap",
});

export const metadata = {
  title: "Open Ship Manifesto",
  description:
    "Open Ship is a movement to publish not only source code, but the complete delivery loop.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${cormorant.variable} ${gloock.variable} ${newsreader.variable}`}>
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

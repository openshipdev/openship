import "./globals.css";
import ThemeToggle from "./theme-toggle";
import { Cormorant_Garamond, Gloock } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const gloock = Gloock({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
  display: "swap",
});

export const metadata = {
  title: "Open Ship Manifesto",
  description:
    "Open Ship is a movement to publish not only source code, but the complete delivery loop.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${cormorant.variable} ${gloock.variable}`}>
        <ThemeToggle />
        {children}
        <Analytics />
      </body>
    </html>
  );
}

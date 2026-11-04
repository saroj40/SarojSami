import { Cormorant_Garamond, Jost } from "next/font/google";
import "./globals.css";
import { site } from "../lib/config";

const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["300", "400", "500"], style: ["normal", "italic"], variable: "--font-display" });
const body = Jost({ subsets: ["latin"], weight: ["300", "400", "500"], variable: "--font-body" });

export const metadata = {
  title: `${site.partnerOne} & ${site.partnerTwo} | Our Engagement`,
  description: site.tagline,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}

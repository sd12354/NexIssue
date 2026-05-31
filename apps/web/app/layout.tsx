import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NexIssue",
    template: "%s · NexIssue",
  },
  description:
    "Graded comic operations — catalog, pricing, eBay listing, and portfolio decisions in one place.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="theme-init" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem("nexissue-theme");if(t==="light")document.documentElement.classList.add("light");}catch(e){}})();`}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

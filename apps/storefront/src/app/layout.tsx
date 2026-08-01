import type { Metadata } from "next";
import type { JSX } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Sammy's Favorites",
  description: "Sammy's Favorites storefront",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): JSX.Element {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

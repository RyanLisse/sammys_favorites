import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  description: "A clean-room storefront shell",
  title: "Sammy's Favorites",
};

type RootLayoutProperties = Readonly<{
  children: ReactNode;
}>;

const RootLayout = ({ children }: RootLayoutProperties) => (
  <html lang="en">
    <body>{children}</body>
  </html>
);

export default RootLayout;

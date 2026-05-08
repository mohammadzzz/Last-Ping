import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Last Ping",
  description: "Private digital legacy delivery",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

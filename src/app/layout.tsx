import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Herdbook — Farm Management Platform",
  description: "Multi-farm pig herd management: breeding, health, feed, sales and expenses.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}

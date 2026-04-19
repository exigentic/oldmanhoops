import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OldManHoops",
  description: "Daily pickup basketball RSVP",
  icons: { icon: "/omh.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}

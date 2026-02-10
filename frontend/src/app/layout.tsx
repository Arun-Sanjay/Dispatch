import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { NavBar } from "@/components/shell/NavBar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dispatch | CPU Scheduling Visualizer",
  description: "Visualize CPU scheduling timelines, queues, and algorithm performance.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} app-shell antialiased`}>
        <div className="app-bg" aria-hidden />
        <NavBar />
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}

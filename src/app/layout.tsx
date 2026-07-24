import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PWAProvider } from "@/components/PWAProvider";
import Navbar from "@/components/Navbar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Prem's World Utensils Shop",
  description: "Offline-first Billing and Inventory System for Prem's World Utensils Shop",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased h-full`}>
      <body className="min-h-full bg-background text-foreground flex flex-col pb-16 md:pb-0">
        <PWAProvider>
          <Navbar />
          <main className="flex-1 w-full p-2 sm:p-4 md:p-6 pb-20 md:pb-6 max-w-full overflow-x-hidden">
            {children}
          </main>
        </PWAProvider>
      </body>
    </html>
  );
}

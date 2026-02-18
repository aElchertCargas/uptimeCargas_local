import type { Metadata } from "next";
import { DM_Mono, Instrument_Sans } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { Sidebar } from "@/components/layout/sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
});

export const metadata: Metadata = {
  title: "Uptime Cargas",
  description: "Internal uptime monitoring dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${instrumentSans.variable} ${dmMono.variable} font-sans antialiased`}
      >
        <Providers>
          <Sidebar />
          <main className="ml-56 min-h-screen">
            <div className="mx-auto max-w-7xl px-6 py-6">
              <ErrorBoundary>{children}</ErrorBoundary>
            </div>
          </main>
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}

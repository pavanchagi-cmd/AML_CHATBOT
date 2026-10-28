import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import { Rail } from "@/components/Rail";
import { ToastProvider } from "@/components/Toast";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  // Variable font: covers the prototype's 400 and 600 weights plus the optical-size axis.
  axes: ["opsz"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "AML Compass",
  description: "Analyst training library: answers come only from your documents, with a source for every point.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${plexSans.variable} ${sourceSerif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ToastProvider>
          <div className="mobile:grid-cols-1 mobile:grid-rows-[1fr_auto] grid h-full grid-cols-[240px_1fr]">
            <Rail />
            <main className="flex min-h-0 min-w-0 flex-col">{children}</main>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./contexts/ThemeContext"; // <--- Import this
import { NutritionProvider } from "./contexts/NutritionContext"; // <--- Import NutritionProvider
import { ChatProvider } from "./contexts/ChatContext"; // <--- Import ChatProvider
import { DevHelpers } from "./components/DevHelpers"; // Development helpers
import { AppContainer } from "./components/AppContainer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL('https://seekeatz.com'),
  title: "SeekEatz",
  description: "AI-Powered Meal Recommendations — find meals that fit your macros from real restaurant menus.",
  openGraph: {
    title: "SeekEatz — AI-Powered Meal Recommendations",
    description: "Find meals that fit your macros — instantly. Verified restaurant nutrition + AI recommendations.",
    type: "website",
    siteName: "SeekEatz",
    images: [{ url: "/logos/waitlist_photo.png", width: 800, height: 1422, alt: "SeekEatz app screenshot" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SeekEatz — AI-Powered Meal Recommendations",
    description: "Find meals that fit your macros — instantly. Verified restaurant nutrition + AI recommendations.",
    images: ["/logos/waitlist_photo.png"],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* suppressHydrationWarning is needed for theme switching to not throw warnings */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('seekeatz-theme') || 'light';
                  document.documentElement.classList.remove('light', 'dark');
                  document.documentElement.classList.add(theme === 'auto' ? 'light' : theme);
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={`${inter.className} bg-slate-100`}>
        <ThemeProvider> {/* Theme provider - wraps everything */}
          <NutritionProvider> {/* Nutrition provider - available to all components */}
            <ChatProvider> {/* Chat provider - persists chat state across navigation */}
              <DevHelpers /> {/* Development-only helpers (console utilities) */}
              <AppContainer>
                {children}
              </AppContainer>
            </ChatProvider>
          </NutritionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
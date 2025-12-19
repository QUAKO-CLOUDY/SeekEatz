import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./contexts/ThemeContext"; // <--- Import this
import { DevHelpers } from "./components/DevHelpers"; // Development helpers
import { AppContainer } from "./components/AppContainer";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SeekEatz",
  description: "AI-Powered Meal Recommendations",
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
        <ThemeProvider> {/* <--- Wrap children with this */}
          <DevHelpers /> {/* Development-only helpers (console utilities) */}
          <AppContainer>
            {children}
          </AppContainer>
        </ThemeProvider>
      </body>
    </html>
  );
}
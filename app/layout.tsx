import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./contexts/ThemeContext"; // <--- Import this

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MacroMatch",
  description: "AI-Powered Meal Recommendations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning> 
      {/* suppressHydrationWarning is needed for theme switching to not throw warnings */}
      <body className={inter.className}>
        <ThemeProvider> {/* <--- Wrap children with this */}
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
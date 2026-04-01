'use client';

import { usePathname } from 'next/navigation';

export function AppContainer({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWaitlist = pathname?.startsWith('/waitlist');
  const isLanding = pathname === '/';
  const isLanding2 = pathname === '/landing-2';

  if (isWaitlist || isLanding || isLanding2) {
    // Full-width layout for waitlist and landing pages
    return <>{children}</>;
  }

  // Responsive container: full width on mobile, centered wider container on desktop
  return (
    <main className="w-full max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto min-h-screen bg-background text-foreground lg:rounded-3xl lg:shadow-xl lg:border lg:border-border overflow-x-hidden overscroll-none transition-colors">
      {children}
    </main>
  );
}


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
    <main className="mx-auto min-h-[100dvh] w-full max-w-md overflow-x-hidden bg-background text-foreground overscroll-none transition-colors md:max-w-2xl lg:max-w-4xl lg:rounded-3xl lg:border lg:border-border lg:shadow-xl xl:max-w-5xl">
      {children}
    </main>
  );
}


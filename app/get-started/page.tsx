'use client';

import Image from 'next/image';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function GetStartedPage() {
  const router = useRouter();

  // NO redirect logic here - /get-started must NEVER auto-redirect
  // Users explicitly visiting /get-started should stay on this page
  // Redirect logic only happens on root / route, not here

  const handleGetStarted = () => {
    // Navigate to onboarding (no auth required)
    router.push('/onboarding');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4 sm:p-6">
      {/* Mobile app container with rounded corners */}
      <div className="w-full max-w-sm mx-auto bg-white rounded-[2.5rem] overflow-hidden">
        <div className="flex flex-col items-center justify-center px-6 py-16 space-y-6">
          {/* Logo at the top - centered */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative w-28 h-28">
              <Image
                src="/logos/seekeatz.png"
                alt="SEEKEATZ Logo"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-2xl sm:text-3xl font-bold text-center text-gray-900 leading-tight px-4">
            Find Meals That Fit Your Macros.
          </h1>

          {/* Explanatory text */}
          <p className="text-sm sm:text-base text-center text-gray-600 leading-relaxed px-4 max-w-xs">
            Search restaurant menus with real nutrition data and macro-friendly results.
          </p>

          {/* Get Started Button - horizontally elongated oval with gradient */}
          <button
            onClick={handleGetStarted}
            className="w-full max-w-[280px] h-14 rounded-full bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-400 hover:from-blue-500 hover:via-cyan-500 hover:to-teal-500 shadow-lg flex items-center justify-center gap-2 text-white font-semibold text-base sm:text-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] mt-4"
          >
            Get Started
            <ArrowRight className="w-5 h-5" strokeWidth={2.5} />
          </button>

          {/* Bottom text */}
          <p className="text-xs sm:text-sm text-center text-gray-600 mt-8 px-4">
            Type what you want to eat, we'll handle the rest.
          </p>
        </div>
      </div>
    </div>
  );
}


"use client";

import { Button } from './ui/button';

type Props = {
  onGetStarted: () => void;
};

// Custom Logo specific to Welcome Screen
function WelcomeLogo() {
  return (
    <svg
      width="200"
      height="200"
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="drop-shadow-2xl"
    >
      {/* Circular Plate */}
      <circle
        cx="100"
        cy="100"
        r="70"
        stroke="url(#gradient1)"
        strokeWidth="2"
        fill="none"
      />
      
      {/* Compass Needle - Top Triangle (pointing upper-right) */}
      <path
        d="M 100 100 L 115 65 L 95 75 Z"
        fill="url(#gradient2)"
        stroke="none"
      />
      
      {/* Compass Needle - Bottom Triangle (pointing lower-left) */}
      <path
        d="M 100 100 L 85 120 L 105 110 Z"
        fill="url(#gradient3)"
        stroke="none"
        opacity="0.7"
      />
      
      {/* Gradient Definitions */}
      <defs>
        <linearGradient id="gradient1" x1="30" y1="30" x2="170" y2="170">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id="gradient2" x1="95" y1="65" x2="115" y2="100">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
        <linearGradient id="gradient3" x1="85" y1="100" x2="105" y2="120">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function WelcomeScreen({ onGetStarted }: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex flex-col items-center justify-between p-8 relative overflow-hidden">
      {/* Subtle background gradient effects */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-40 right-1/4 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      
      {/* Status Bar Spacer */}
      <div className="h-8" />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center z-10 -mt-12">
        {/* Logo */}
        <div className="mb-8">
          <WelcomeLogo />
        </div>
        
        {/* App Name */}
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent text-center">
          MacroMatch AI
        </h1>
        
        {/* Tagline */}
        <p className="text-gray-400 text-center mb-12 max-w-xs text-lg leading-relaxed">
          Your AI-powered nutrition companion for finding meals that match your macros
        </p>
        
        {/* Sign Up Button */}
        <Button
          onClick={onGetStarted}
          className="w-72 h-14 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-lg shadow-cyan-500/30 mb-4 text-lg font-semibold"
        >
          Get Started
        </Button>
        
        {/* Divider */}
        <div className="flex items-center gap-3 w-72 my-4">
          <div className="flex-1 h-px bg-gray-700" />
          <span className="text-gray-500 text-sm">or</span>
          <div className="flex-1 h-px bg-gray-700" />
        </div>
        
        {/* Sign In Link */}
        <button className="text-gray-400 hover:text-cyan-400 transition-colors text-sm font-medium">
          Already have an account? <span className="text-cyan-400">Sign in</span>
        </button>
      </div>
      
      {/* Bottom Slogan */}
      <div className="z-10 pb-8">
        <p className="text-gray-500 tracking-wide text-sm uppercase">
          eat smarter, anywhere
        </p>
      </div>
    </div>
  );
}
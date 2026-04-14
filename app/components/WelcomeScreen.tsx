"use client";

import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import Logo from './Logo';

type Props = {
  onGetStarted: () => void;
};

export function WelcomeScreen({ onGetStarted }: Props) {
  void onGetStarted;
  const router = useRouter();

  const handleSignIn = () => {
    router.push('/auth/signin');
  };

  const handleSignUp = () => {
    router.push('/auth/signup');
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-between p-8 relative overflow-hidden">
      {/* Subtle background gradient effects - light theme */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-40 right-1/4 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
      
      {/* Status Bar Spacer */}
      <div className="h-8" />
      
      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center z-10 -mt-12">
        {/* Logo - Large and Prominent */}
        <div className="mb-12 flex flex-col items-center">
          <div className="mb-6">
            <Logo size="lg" showText={true} className="justify-center" />
          </div>
        </div>
        
        {/* Tagline */}
        <p className="text-gray-600 text-center mb-12 max-w-xs text-lg leading-relaxed">
          AI concierge that scans menus and finds your best meal instantly
        </p>
        
        {/* Sign Up Button */}
        <Button
          onClick={handleSignUp}
          className="w-72 h-14 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-lg shadow-cyan-500/30 mb-4 text-lg font-semibold"
        >
          Sign Up
        </Button>
        
        {/* Divider */}
        <div className="flex items-center gap-3 w-72 my-4">
          <div className="flex-1 h-px bg-gray-300" />
          <span className="text-gray-500 text-sm">or</span>
          <div className="flex-1 h-px bg-gray-300" />
        </div>
        
        {/* Sign In Link */}
        <button 
          onClick={handleSignIn}
          className="text-gray-600 hover:text-cyan-500 transition-colors text-sm font-medium"
        >
          Already have an account? <span className="text-cyan-500">Sign in</span>
        </button>
      </div>
      
      {/* Bottom Slogan */}
      <div className="z-10 pb-8">
        <p className="text-gray-400 tracking-wide text-sm uppercase">
          eat smarter, anywhere
        </p>
      </div>
    </div>
  );
}

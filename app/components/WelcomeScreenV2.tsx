"use client";

import { Button } from './ui/button';
import { ChevronRight } from 'lucide-react';

type Props = {
  onGetStarted: () => void;
};

export function WelcomeScreenV2({ onGetStarted }: Props) {
  return (
    <div 
      className="min-h-screen flex items-center justify-center relative overflow-hidden"
      style={{ backgroundColor: '#0B0F19' }}
    >
      {/* Radial Gradient Background */}
      <div 
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, rgba(59, 130, 246, 0.2) 0%, rgba(6, 182, 212, 0.1) 30%, transparent 70%)',
        }}
      />

      <div className="max-w-md w-full px-6 relative z-10 flex flex-col items-center">
        
        {/* 1. TEXT SECTION */}
        <div className="text-center mb-10">
          <h1 
            className="text-5xl mb-4 leading-tight tracking-tight font-bold text-white"
          >
            <span className="block bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent">
              Better meals,
            </span>
            <span className="block">in every direction.</span>
          </h1>
          
          <p className="text-gray-400 text-lg leading-relaxed mt-4">
            The AI concierge that finds high-protein meals at restaurants near you.
          </p>
        </div>

        {/* 2. PHONE MOCKUP SECTION */}
        <div className="mb-10 relative">
          <div className="mx-auto w-56 h-96 bg-gradient-to-br from-gray-900 to-gray-950 rounded-[2.5rem] border-[6px] border-gray-800 shadow-2xl relative overflow-hidden flex items-center justify-center">
             {/* Reflection */}
             <div 
              className="absolute inset-0 opacity-20 pointer-events-none z-20"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.1) 100%)',
              }}
            />
             {/* Simple Placeholder Content */}
             <div className="text-center p-4">
                <div className="w-16 h-16 bg-cyan-500/20 rounded-full mx-auto mb-4 flex items-center justify-center">
                  <span className="text-2xl">🥗</span>
                </div>
                <p className="text-gray-500 text-xs font-medium">Finding meals...</p>
             </div>
          </div>
        </div>

        {/* 3. BUTTON SECTION */}
        <div className="w-full">
          <Button
            onClick={onGetStarted}
            className="h-14 rounded-full w-full text-lg font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 border-0 shadow-lg shadow-cyan-500/20"
          >
            Get Started
            <ChevronRight className="ml-2 w-6 h-6" />
          </Button>
        </div>

        {/* 4. PROGRESS DOTS */}
        <div className="flex gap-2 justify-center mt-8">
          <div className="h-2 w-8 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full" />
          <div className="h-2 w-2 bg-gray-700 rounded-full" />
          <div className="h-2 w-2 bg-gray-700 rounded-full" />
        </div>

      </div>
    </div>
  );
}
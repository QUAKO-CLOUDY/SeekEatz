"use client";

import { useState } from 'react';
import { Button } from './ui/button';
import { ChevronRight, MapPin, Sparkles, Target } from 'lucide-react';

type Props = {
  onComplete: () => void;
};

export function MicroOnboarding({ onComplete }: Props) {
  const [step, setStep] = useState(1);

  if (step === 1) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
        
        <div className="w-full max-w-md text-center relative z-10">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-teal-500 to-blue-500 rounded-full blur-2xl opacity-20 animate-pulse" />
              <MapPin className="w-20 h-20 text-teal-500 relative" strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-4">Eat Anywhere</h1>
          <p className="text-muted-foreground text-lg mb-12 leading-relaxed">
            Whether you're at a restaurant, grocery store, or food court, MacroMatch finds meals that fit your goals.
          </p>

          <div className="flex gap-2 justify-center mb-8">
            <div className="h-2 w-12 bg-gradient-to-r from-teal-500 to-blue-500 rounded-full" />
            <div className="h-2 w-12 bg-muted rounded-full" />
            <div className="h-2 w-12 bg-muted rounded-full" />
          </div>

          <Button
            onClick={() => setStep(2)}
            className="h-14 rounded-full bg-gradient-to-r from-teal-500 to-blue-500 hover:from-teal-600 hover:to-blue-600 text-white shadow-lg shadow-teal-500/20 w-full text-lg"
          >
            Next
            <ChevronRight className="ml-2 w-5 h-5" />
          </Button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />
        
        <div className="w-full max-w-md text-center relative z-10">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full blur-2xl opacity-20 animate-pulse" />
              <Sparkles className="w-20 h-20 text-purple-500 relative" strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-4">AI Menu Scraper</h1>
          <p className="text-muted-foreground text-lg mb-12 leading-relaxed">
            Our AI scans restaurant menus and grocery stores to find meals that match your exact calorie and macro needs.
          </p>

          <div className="flex gap-2 justify-center mb-8">
            <div className="h-2 w-12 bg-muted rounded-full" />
            <div className="h-2 w-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" />
            <div className="h-2 w-12 bg-muted rounded-full" />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(1)}
              className="h-14 rounded-full border-muted-foreground/20 text-foreground hover:bg-muted flex-1"
            >
              Back
            </Button>
            <Button
              onClick={() => setStep(3)}
              className="h-14 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white shadow-lg shadow-purple-500/20 flex-[2] text-lg"
            >
              Next
              <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 3) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-muted/20 to-background" />

        <div className="w-full max-w-md text-center relative z-10">
          <div className="mb-8 flex justify-center">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-red-500 rounded-full blur-2xl opacity-20 animate-pulse" />
              <Target className="w-20 h-20 text-orange-500 relative" strokeWidth={1.5} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-foreground mb-4">No Guesswork</h1>
          <p className="text-muted-foreground text-lg mb-12 leading-relaxed">
            Stop manually tracking meals. Just tell us what you want and we'll find the perfect options that fit your macros.
          </p>

          <div className="flex gap-2 justify-center mb-8">
            <div className="h-2 w-12 bg-muted rounded-full" />
            <div className="h-2 w-12 bg-muted rounded-full" />
            <div className="h-2 w-12 bg-gradient-to-r from-orange-500 to-red-500 rounded-full" />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setStep(2)}
              className="h-14 rounded-full border-muted-foreground/20 text-foreground hover:bg-muted flex-1"
            >
              Back
            </Button>
            <Button
              onClick={onComplete}
              className="h-14 rounded-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white shadow-lg shadow-orange-500/20 flex-[2] text-lg"
            >
              Get Started
              <ChevronRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
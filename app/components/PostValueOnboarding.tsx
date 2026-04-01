"use client";

import { useState } from "react";

const slides = [
  "Eating out shouldn’t mean guessing your calories and macros.",
  "Search anything-your goals, cravings, or calories-and we find meals that fit.",
  "Every result is based on verified nutrition data. No estimates. No guesswork.",
  "Know what to order before you order-and stay on track effortlessly.",
];

type Props = {
  onComplete: () => void;
  onSkip?: () => void;
};

export function PostValueOnboarding({ onComplete, onSkip }: Props) {
  const [index, setIndex] = useState(0);
  const isLast = index === slides.length - 1;

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-t-[2rem] bg-white p-6 pb-8 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex gap-2">
            {slides.map((_, slideIndex) => (
              <span
                key={slideIndex}
                className={`h-1.5 w-8 rounded-full ${slideIndex === index ? "bg-cyan-500" : "bg-slate-200"}`}
              />
            ))}
          </div>
          {onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              className="text-sm font-medium text-slate-500"
            >
              Skip
            </button>
          ) : null}
        </div>

        <div className="rounded-[1.75rem] bg-slate-50 p-6">
          <p className="text-2xl font-semibold leading-tight text-slate-900">
            {slides[index]}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (isLast) {
              onComplete();
              return;
            }

            setIndex((current) => current + 1);
          }}
          className="mt-6 w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-4 text-base font-semibold text-white shadow-lg shadow-cyan-500/25"
        >
          {isLast ? "Show me meals" : "Continue"}
        </button>
      </div>
    </div>
  );
}

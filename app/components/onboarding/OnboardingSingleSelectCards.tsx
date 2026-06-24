"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Check } from "lucide-react";
import { onboardingTransition } from "./onboarding-motion";

type Option = {
  value: string;
  label: string;
  description?: string;
};

type Props = {
  options: Option[];
  value?: string;
  onChange: (value: string) => void;
};

export function OnboardingSingleSelectCards({ options, value, onChange }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="space-y-2.5">
      {options.map((option, index) => {
        const isSelected = value === option.value;

        return (
          <motion.button
            key={option.value}
            type="button"
            initial={{ opacity: reduceMotion ? 1 : 0, y: reduceMotion ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={onboardingTransition(reduceMotion, 0.04 + index * 0.04)}
            onClick={() => onChange(option.value)}
            className={`flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all ${
              isSelected
                ? "border-cyan-500/50 bg-cyan-500/5 shadow-sm"
                : "border-border/70 bg-background hover:border-cyan-500/30 hover:bg-muted/30"
            }`}
          >
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                isSelected
                  ? "border-cyan-500 bg-gradient-to-br from-cyan-500 to-blue-600 text-white"
                  : "border-border bg-background"
              }`}
              aria-hidden
            >
              {isSelected ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground sm:text-base">
                {option.label}
              </span>
              {option.description ? (
                <span className="mt-1 block text-sm leading-snug text-muted-foreground">
                  {option.description}
                </span>
              ) : null}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

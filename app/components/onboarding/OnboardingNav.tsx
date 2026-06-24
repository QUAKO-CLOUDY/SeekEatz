"use client";

import { ChevronRight } from "lucide-react";
import { Button } from "../ui/button";

type Props = {
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
  primaryClassName?: string;
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
};

export function OnboardingNav({
  onBack,
  onNext,
  nextLabel = "Continue",
  nextDisabled = false,
  showBack = true,
  primaryClassName = "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-cyan-500/20",
  secondaryAction,
}: Props) {
  const hasBack = showBack && onBack;

  return (
    <div className="space-y-3">
      <div className={`flex gap-3 ${hasBack ? "" : ""}`}>
        {hasBack ? (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="h-14 flex-1 rounded-full border-muted-foreground/20 text-foreground hover:bg-muted"
          >
            Back
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={onNext}
          disabled={nextDisabled}
          className={`h-14 rounded-full text-base font-semibold text-white shadow-lg disabled:opacity-50 ${hasBack ? "flex-[2]" : "w-full"} ${primaryClassName}`}
        >
          {nextLabel}
          <ChevronRight className="ml-2 h-5 w-5" />
        </Button>
      </div>

      {secondaryAction ? (
        <button
          type="button"
          onClick={secondaryAction.onClick}
          className="mx-auto block w-full py-2 text-center text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {secondaryAction.label}
        </button>
      ) : null}
    </div>
  );
}

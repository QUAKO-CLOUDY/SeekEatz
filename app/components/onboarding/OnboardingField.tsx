"use client";

import type { ReactNode } from "react";
import { Label } from "../ui/label";

type Props = {
  label: string;
  htmlFor?: string;
  children: ReactNode;
};

export function OnboardingField({ label, htmlFor, children }: Props) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

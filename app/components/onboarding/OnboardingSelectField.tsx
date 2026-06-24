"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

type Props = {
  value?: string;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
};

export function OnboardingSelectField({
  value,
  placeholder = "Select an option",
  options,
  onValueChange,
}: Props) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-14 w-full rounded-2xl border-border/80 bg-background px-4 text-base shadow-sm focus-visible:border-cyan-500 focus-visible:ring-cyan-500/20">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="rounded-xl border-border/80 shadow-xl">
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className="rounded-lg py-3 text-base"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

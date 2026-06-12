"use client";

import { MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

const DISTANCE_OPTIONS = [1, 2, 5, 10, 15, 20] as const;

type Props = {
  value: number;
  onValueChange: (miles: number) => void;
};

export function SearchRadiusSelect({ value, onValueChange }: Props) {
  return (
    <Select
      value={value.toString()}
      onValueChange={(nextValue) => onValueChange(Number(nextValue))}
    >
      <SelectTrigger className="h-7 w-auto min-w-[50px] sm:h-7 sm:min-w-[55px] px-1 sm:px-1.5 rounded-full border-border bg-muted/50 hover:bg-muted text-[10px] font-medium text-foreground gap-0.5 opacity-90 [&_svg:not([class*='text-'])]:text-muted-foreground">
        <MapPin className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
        <SelectValue className="text-[10px] text-foreground">{value} mi</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {DISTANCE_OPTIONS.map((distance) => (
          <SelectItem key={distance} value={distance.toString()}>
            {distance} {distance === 1 ? "mile" : "miles"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

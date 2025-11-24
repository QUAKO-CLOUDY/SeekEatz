"use client";

import React from "react";

type Props = {
  percentage?: number;
  colorStart?: string;
  colorEnd?: string;
  size?: number;
  strokeWidth?: number;
  // Alternative props
  value?: number;
  max?: number;
  color?: string;
};

export function CircularProgress({
  percentage,
  colorStart,
  colorEnd,
  value,
  max = 100,
  color,
  size = 192,
  strokeWidth = 16,
}: Props) {
  // Support both prop signatures
  let actualPercentage = percentage ?? 0;
  if (value !== undefined && max !== undefined) {
    actualPercentage = max > 0 ? (value / max) * 100 : 0;
  }

  // Parse gradient colors from color string like "from-orange-500 to-red-500"
  let startColor = colorStart || "#06b6d4";
  let endColor = colorEnd || "#0ea5e9";

  if (color) {
    const colorMap: Record<string, { start: string; end: string }> = {
      "from-orange-500 to-red-500": { start: "#f97316", end: "#ef4444" }, // calories
      "from-blue-500 to-cyan-500": { start: "#3b82f6", end: "#06b6d4" }, // protein
      "from-green-500 to-emerald-500": { start: "#22c55e", end: "#10b981" }, // carbs
      "from-purple-500 to-pink-500": { start: "#a855f7", end: "#ec4899" }, // old fat
      "from-amber-500 to-orange-600": { start: "#f59e0b", end: "#d97706" }, // new fat (warm orange)
    };

    if (colorMap[color]) {
      startColor = colorMap[color].start;
      endColor = colorMap[color].end;
    }
  }

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const safePercentage = Math.min(Math.max(actualPercentage || 0, 0), 100);
  const offset = circumference - (safePercentage / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90"
    >
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgb(31 41 55 / 0.5)"
        strokeWidth={strokeWidth}
      />
      {/* Progress circle with gradient */}
      <defs>
        <linearGradient
          id={`gradient-${size}-${startColor}`}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
        >
          <stop offset="0%" stopColor={startColor} />
          <stop offset="100%" stopColor={endColor} />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={`url(#gradient-${size}-${startColor})`}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-700 ease-out"
        style={{
          filter: `drop-shadow(0 0 8px ${startColor})`,
        }}
      />
    </svg>
  );
}
"use client";

import { useTheme } from '../contexts/ThemeContext';

type CircularProgressProps = {
  percentage: number;
  colorStart?: string;
  colorEnd?: string;
  size: number;
  strokeWidth: number;
};

export function CircularProgress({
  percentage,
  colorStart,
  colorEnd,
  size,
  strokeWidth,
}: CircularProgressProps) {
  const { resolvedTheme } = useTheme();
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const safePercentage = Math.min(100, Math.max(0, percentage));
  // Create unique gradient ID based on size and colors to avoid conflicts
  const gradientId = `gradient-${size}-${colorStart?.replace('#', '')}-${colorEnd?.replace('#', '')}`;
  
  // Theme-aware background circle color
  const bgStrokeColor = resolvedTheme === 'dark' ? '#6b7280' : '#e5e7eb';
  const bgOpacity = resolvedTheme === 'dark' ? '0.3' : '0.4';

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={colorStart || "#67e8f9"} stopOpacity="0.8" />
            <stop offset="100%" stopColor={colorEnd || colorStart || "#7dd3fc"} stopOpacity="0.8" />
          </linearGradient>
        </defs>
        {/* Background Circle - Theme-aware */}
        <circle 
          cx={size/2} 
          cy={size/2} 
          r={radius} 
          stroke={bgStrokeColor} 
          strokeWidth={strokeWidth} 
          fill="transparent"
          strokeOpacity={bgOpacity}
        />
        {/* Progress Circle with Gradient */}
        <circle
          cx={size/2}
          cy={size/2}
          r={radius}
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (safePercentage / 100) * circumference}
          strokeLinecap="round"
          strokeOpacity="0.75"
          className="transition-all duration-700 ease-out"
        />
      </svg>
    </div>
  );
}

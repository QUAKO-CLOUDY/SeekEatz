"use client";

import * as React from "react";

type Props = {
  size?: number;
  className?: string;
};

export function MacroMatchLogo({ size = 200, className = '' }: Props) {
  const center = size / 2;
  const plateRadius = size * 0.45;
  const innerPlateRadius = size * 0.42;
  
  // Fork and knife proportions
  const forkLength = size * 0.325; // 65% of diameter
  const knifeLength = forkLength * 0.4;
  
  // Rotation angles
  const forkAngle = 35; // degrees, upward-right
  const knifeAngle = forkAngle + 180; // opposite direction
  
  // Compass hub
  const hubRadius = size * 0.025;
  
  // Utensil width (thin for minimal look)
  const utensilWidth = size * 0.01;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="utensilGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#33C1C2" />
          <stop offset="100%" stopColor="#2B7FFF" />
        </linearGradient>
      </defs>

      {/* Outer plate rim */}
      <circle
        cx={center}
        cy={center}
        r={plateRadius}
        stroke="#E6E8EB"
        strokeWidth="2.5"
        fill="white"
      />

      {/* Inner plate rim */}
      <circle
        cx={center}
        cy={center}
        r={innerPlateRadius}
        stroke="#C9CCD1"
        strokeWidth="1.5"
        fill="none"
      />

      {/* Fork (longer needle, pointing upward-right) */}
      <g transform={`rotate(${forkAngle} ${center} ${center})`}>
        {/* Fork handle - extends from hub to tines */}
        <line
          x1={center}
          y1={center + hubRadius}
          x2={center}
          y2={center - forkLength + (forkLength * 0.2)}
          stroke="url(#utensilGradient)"
          strokeWidth={utensilWidth}
          strokeLinecap="butt"
        />
        
        {/* Fork tines (3 thin prongs) */}
        <g>
          {/* Left tine */}
          <line
            x1={center - utensilWidth * 2}
            y1={center - forkLength + (forkLength * 0.2)}
            x2={center - utensilWidth * 2}
            y2={center - forkLength}
            stroke="url(#utensilGradient)"
            strokeWidth={utensilWidth * 0.8}
            strokeLinecap="butt"
          />
          {/* Center tine */}
          <line
            x1={center}
            y1={center - forkLength + (forkLength * 0.2)}
            x2={center}
            y2={center - forkLength}
            stroke="url(#utensilGradient)"
            strokeWidth={utensilWidth * 0.8}
            strokeLinecap="butt"
          />
          {/* Right tine */}
          <line
            x1={center + utensilWidth * 2}
            y1={center - forkLength + (forkLength * 0.2)}
            x2={center + utensilWidth * 2}
            y2={center - forkLength}
            stroke="url(#utensilGradient)"
            strokeWidth={utensilWidth * 0.8}
            strokeLinecap="butt"
          />
          {/* Horizontal connector between tines */}
          <line
            x1={center - utensilWidth * 2}
            y1={center - forkLength + (forkLength * 0.2)}
            x2={center + utensilWidth * 2}
            y2={center - forkLength + (forkLength * 0.2)}
            stroke="url(#utensilGradient)"
            strokeWidth={utensilWidth * 0.8}
            strokeLinecap="butt"
          />
        </g>
      </g>

      {/* Knife (shorter needle, pointing down-left) */}
      <g transform={`rotate(${knifeAngle} ${center} ${center})`}>
        {/* Knife handle */}
        <line
          x1={center}
          y1={center + hubRadius}
          x2={center}
          y2={center - knifeLength + (knifeLength * 0.15)}
          stroke="url(#utensilGradient)"
          strokeWidth={utensilWidth}
          strokeLinecap="butt"
        />
        
        {/* Knife blade (thin triangle) */}
        <path
          d={`
            M ${center - utensilWidth * 1.2} ${center - knifeLength + (knifeLength * 0.15)}
            L ${center} ${center - knifeLength}
            L ${center + utensilWidth * 1.2} ${center - knifeLength + (knifeLength * 0.15)}
            Z
          `}
          fill="url(#utensilGradient)"
          stroke="none"
        />
      </g>

      {/* Compass hub (center circle) */}
      <circle
        cx={center}
        cy={center}
        r={hubRadius}
        fill="url(#utensilGradient)"
      />
    </svg>
  );
}
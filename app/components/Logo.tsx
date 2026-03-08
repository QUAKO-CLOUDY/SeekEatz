"use client";

import React, { useId } from 'react';

type LogoProps = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
};

export default function Logo({ 
  className = '', 
  size = 'md',
  showText = true 
}: LogoProps) {
  const gradientId = useId();
  
  // Size configurations
  const sizeConfig = {
    sm: { icon: 24, text: 'text-lg', spacing: 'gap-2' },
    md: { icon: 32, text: 'text-xl', spacing: 'gap-2.5' },
    lg: { icon: 48, text: 'text-2xl', spacing: 'gap-3' },
  };

  const config = sizeConfig[size];
  const iconSize = config.icon;

  return (
    <div className={`flex items-center ${config.spacing} ${className}`}>
      {/* SVG Icon: Magnifying Glass + Fork */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          {/* Clip path to show menu lines only inside the magnifying glass */}
          <clipPath id={`menuClip-${gradientId}`}>
            <circle cx="14" cy="14" r="9.5" />
          </clipPath>
        </defs>
        
        {/* Mini floating menu - centered inside the glass */}
        <g clipPath={`url(#menuClip-${gradientId})`}>
          {/* Background fill for menu area */}
          <circle
            cx="14"
            cy="14"
            r="9.5"
            fill="rgba(6, 182, 212, 0.08)"
          />
          
          {/* Compact menu block inside the glass */}
          <g transform="translate(14, 14)">
            <line x1="-5" y1="-4" x2="4" y2="-4" stroke={`url(#${gradientId})`} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
            <circle cx="5" cy="-4" r="0.6" fill={`url(#${gradientId})`} opacity="0.5" />
            <line x1="-5" y1="-2" x2="5" y2="-2" stroke={`url(#${gradientId})`} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
            <circle cx="5.5" cy="-2" r="0.6" fill={`url(#${gradientId})`} opacity="0.5" />
            <line x1="-5" y1="0" x2="3" y2="0" stroke={`url(#${gradientId})`} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
            <circle cx="4" cy="0" r="0.6" fill={`url(#${gradientId})`} opacity="0.5" />
            <line x1="-5" y1="2" x2="4" y2="2" stroke={`url(#${gradientId})`} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
            <circle cx="5" cy="2" r="0.6" fill={`url(#${gradientId})`} opacity="0.5" />
            <line x1="-5" y1="4" x2="3" y2="4" stroke={`url(#${gradientId})`} strokeWidth="1" strokeLinecap="round" opacity="0.6" />
            <circle cx="4" cy="4" r="0.6" fill={`url(#${gradientId})`} opacity="0.5" />
          </g>
        </g>
        
        {/* Magnifying Glass Circle - slightly bigger */}
        <circle
          cx="14"
          cy="14"
          r="9.5"
          stroke={`url(#${gradientId})`}
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        
        {/* Magnifying Glass Handle */}
        <line
          x1="20.7"
          y1="20.7"
          x2="26"
          y2="26"
          stroke={`url(#${gradientId})`}
          strokeWidth="2"
          strokeLinecap="round"
        />
        
        {/* Fork - centered inside the magnifying glass */}
        <g transform="translate(9, 9)">
          {/* Fork Handle (vertical line) */}
          <line
            x1="5"
            y1="2"
            x2="5"
            y2="8"
            stroke={`url(#${gradientId})`}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {/* Left Tine */}
          <line
            x1="5"
            y1="2"
            x2="2.5"
            y2="0"
            stroke={`url(#${gradientId})`}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {/* Center Tine */}
          <line
            x1="5"
            y1="2"
            x2="5"
            y2="0"
            stroke={`url(#${gradientId})`}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {/* Right Tine */}
          <line
            x1="5"
            y1="2"
            x2="7.5"
            y2="0"
            stroke={`url(#${gradientId})`}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </g>
      </svg>

      {/* Text */}
      {showText && (
        <span className={`font-bold ${config.text} bg-gradient-to-r from-cyan-500 to-blue-600 bg-clip-text text-transparent`}>
          SeekEatz
        </span>
      )}
    </div>
  );
}


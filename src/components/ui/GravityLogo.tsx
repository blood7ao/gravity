import React from 'react';

interface GravityLogoProps {
  className?: string;
  size?: number | string;
  withSquircle?: boolean;
}

export function GravityLogo({
  className = 'w-6 h-6',
  size,
  withSquircle = false,
}: GravityLogoProps) {
  const style = size ? { width: size, height: size } : undefined;

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      <defs>
        <linearGradient id="agy-rainbow-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FA5D29" />
          <stop offset="28%" stopColor="#FBBF24" />
          <stop offset="55%" stopColor="#10B981" />
          <stop offset="78%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>

        <filter id="agy-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.12" />
        </filter>
      </defs>

      {withSquircle && (
        <rect
          x="6"
          y="6"
          width="88"
          height="88"
          rx="22"
          className="fill-white dark:fill-zinc-900 stroke-zinc-200 dark:stroke-zinc-800"
          strokeWidth="1.5"
          filter="url(#agy-shadow)"
        />
      )}

      {/* Inverted rainbow arch / gravitational curve */}
      <path
        d="M 26 26 C 30 52 40 76 50 76 C 60 76 70 52 74 26 C 75 22 68 20 65 25 C 60 44 54 58 50 58 C 46 58 40 44 35 25 C 32 20 25 22 26 26 Z"
        fill="url(#agy-rainbow-grad)"
      />
    </svg>
  );
}

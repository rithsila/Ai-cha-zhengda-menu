interface LuckyWheelIconProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

/**
 * High-definition SVG Lucky Draw Wheel icon with 8 prize segments and stationary pointer.
 * Supports smooth, continuous spinning animation.
 */
export function LuckyWheelIcon({ size = 22, className = '', animate = true }: LuckyWheelIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 overflow-visible ${className}`}
    >
      {/* Smooth Rotating Wheel Slices & Hub */}
      <g
        style={
          animate
            ? {
                transformOrigin: '16px 16px',
                animation: 'luckyWheelSpin 8s linear infinite',
              }
            : undefined
        }
      >
        {/* Outer Border Ring */}
        <circle cx="16" cy="16" r="14" fill="#1E293B" stroke="#F59E0B" strokeWidth="1.5" />

        {/* 8 Color Wedges */}
        <path d="M16 16L16 3A13 13 0 0 1 25.19 6.81Z" fill="#EF4444" />
        <path d="M16 16L25.19 6.81A13 13 0 0 1 29 16Z" fill="#F59E0B" />
        <path d="M16 16L29 16A13 13 0 0 1 25.19 25.19Z" fill="#10B981" />
        <path d="M16 16L25.19 25.19A13 13 0 0 1 16 29Z" fill="#3B82F6" />
        <path d="M16 16L16 29A13 13 0 0 1 6.81 25.19Z" fill="#8B5CF6" />
        <path d="M16 16L6.81 25.19A13 13 0 0 1 3 16Z" fill="#EC4899" />
        <path d="M16 16L3 16A13 13 0 0 1 6.81 6.81Z" fill="#F97316" />
        <path d="M16 16L6.81 6.81A13 13 0 0 1 16 3Z" fill="#14B8A6" />

        {/* Inner White Rim */}
        <circle cx="16" cy="16" r="13" stroke="#FFFFFF" strokeWidth="0.75" strokeOpacity="0.7" />

        {/* Center Golden Hub Pin */}
        <circle cx="16" cy="16" r="3.2" fill="#FFFFFF" stroke="#F59E0B" strokeWidth="1.5" />
        <circle cx="16" cy="16" r="1.4" fill="#F59E0B" />
      </g>

      {/* Stationary Top Pointer Arrow (12 o'clock) */}
      <polygon points="16,0.8 13.5,5.2 18.5,5.2" fill="#FEF08A" stroke="#D97706" strokeWidth="0.6" />

      {/* Embedded CSS Animation Definition */}
      <style>{`
        @keyframes luckyWheelSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}

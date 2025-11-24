export function CircularProgress({ percentage, colorStart, colorEnd, size, strokeWidth }: any) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background Circle */}
        <circle cx={size/2} cy={size/2} r={radius} stroke="#1f2937" strokeWidth={strokeWidth} fill="transparent" />
        {/* Progress Circle */}
        <circle
          cx={size/2}
          cy={size/2}
          r={radius}
          stroke={colorStart}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
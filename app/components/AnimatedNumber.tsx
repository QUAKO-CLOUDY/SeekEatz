'use client';

import { motion } from 'framer-motion';

type AnimatedNumberProps = {
  value: number;
  /** e.g. '' for calories, 'g' for grams */
  suffix?: string;
  /** When true, show as "X over" for negative (e.g. calories left) */
  showOverWhenNegative?: boolean;
  className?: string;
  /** Optional: override display (e.g. "1,234" or "45g over") */
  displayValue?: string;
};

const spring = { type: 'spring' as const, stiffness: 400, damping: 25 };

export function AnimatedNumber({
  value,
  suffix = '',
  showOverWhenNegative = false,
  className = '',
  displayValue,
}: AnimatedNumberProps) {
  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const text =
    displayValue ??
    (showOverWhenNegative && isNegative
      ? `${absValue}${suffix ? suffix + ' ' : ''}over`
      : `${isNegative ? '-' : ''}${absValue}${suffix}`);

  return (
    <motion.span
      key={`${value}-${suffix}`}
      className={`tabular-nums inline-block ${className}`}
      initial={{ scale: 1.2, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={spring}
    >
      {text}
    </motion.span>
  );
}

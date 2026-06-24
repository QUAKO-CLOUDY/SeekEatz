"use client";

import { motion, useReducedMotion } from "framer-motion";

type Props = {
  className?: string;
};

export function OnboardingCalculatingAnimation({ className = "" }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={`relative mx-auto flex h-32 w-32 items-center justify-center ${className}`}>
      <motion.div
        className="absolute inset-0 rounded-full border border-cyan-500/15"
        animate={reduceMotion ? undefined : { scale: [1, 1.08, 1], opacity: [0.5, 0.85, 0.5] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute inset-3 rounded-full border border-cyan-500/25"
        animate={reduceMotion ? undefined : { scale: [1.04, 1, 1.04], opacity: [0.65, 1, 0.65] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
      />

      {!reduceMotion
        ? [0, 120, 240].map((rotation, index) => (
            <motion.div
              key={rotation}
              className="absolute inset-0"
              animate={{ rotate: 360 }}
              transition={{
                duration: 2.8 + index * 0.4,
                repeat: Infinity,
                ease: "linear",
              }}
            >
              <span
                className={`absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full shadow-sm ${
                  index === 0
                    ? "bg-cyan-500"
                    : index === 1
                      ? "bg-blue-500"
                      : "bg-teal-400"
                }`}
              />
            </motion.div>
          ))
        : null}

      <div className="relative flex h-14 w-14 items-center justify-center gap-1 rounded-2xl border border-cyan-500/20 bg-background/90 shadow-inner backdrop-blur-sm">
        {[0, 1, 2].map((bar) => (
          <motion.span
            key={bar}
            className="w-1.5 rounded-full bg-gradient-to-t from-cyan-600 to-blue-400"
            animate={
              reduceMotion
                ? { height: 16 }
                : { height: [10, 22, 14, 24, 10] }
            }
            transition={{
              duration: 1.1,
              repeat: Infinity,
              ease: "easeInOut",
              delay: bar * 0.15,
            }}
            style={{ height: 16 }}
          />
        ))}
      </div>
    </div>
  );
}

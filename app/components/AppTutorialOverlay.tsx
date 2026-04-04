"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Screen } from "./Navigation";

export type AppTutorialStep = {
  screen: Screen;
  title: string;
  body: string;
  target: string;
  buttonLabel: string;
};

type Props = {
  step: AppTutorialStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
};

type Rect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function AppTutorialOverlay({ step, stepIndex, totalSteps, onNext }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(0);

  useEffect(() => {
    let frameId = 0;

    const updatePosition = () => {
      const targetElement = document.querySelector<HTMLElement>(
        `[data-tutorial-target="${step.target}"]`,
      );

      if (!targetElement) {
        frameId = window.requestAnimationFrame(updatePosition);
        return;
      }

      const rect = targetElement.getBoundingClientRect();
      setTargetRect({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    };

    updatePosition();

    const onViewportChange = () => updatePosition();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, [step.target]);

  useEffect(() => {
    if (!cardRef.current) {
      return;
    }

    const updateCardHeight = () => {
      setCardHeight(cardRef.current?.getBoundingClientRect().height ?? 0);
    };

    updateCardHeight();

    const resizeObserver = new ResizeObserver(updateCardHeight);
    resizeObserver.observe(cardRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [step.title, step.body, step.buttonLabel]);

  const layout = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        cardTop: 24,
        cardLeft: 16,
        spotlight: null as Rect | null,
        arrow: null as { left: number; top: number; direction: "up" | "down" } | null,
      };
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const horizontalPadding = 16;
    const spotlightPadding = 10;

    if (!targetRect) {
      return {
        cardTop: viewportHeight - Math.max(cardHeight, 220) - 32,
        cardLeft: horizontalPadding,
        spotlight: null as Rect | null,
        arrow: null as { left: number; top: number; direction: "up" | "down" } | null,
      };
    }

    const spotlight = {
      top: Math.max(12, targetRect.top - spotlightPadding),
      left: Math.max(12, targetRect.left - spotlightPadding),
      width: targetRect.width + spotlightPadding * 2,
      height: targetRect.height + spotlightPadding * 2,
    };

    const cardWidth = Math.min(360, viewportWidth - horizontalPadding * 2);
    const placeAbove = targetRect.top > viewportHeight * 0.55;
    const cardTop = placeAbove
      ? clamp(targetRect.top - cardHeight - 22, 20, viewportHeight - cardHeight - 20)
      : clamp(targetRect.top + targetRect.height + 22, 20, viewportHeight - cardHeight - 20);
    const cardLeft = clamp(
      targetRect.left + targetRect.width / 2 - cardWidth / 2,
      horizontalPadding,
      viewportWidth - cardWidth - horizontalPadding,
    );

    const arrowLeft = clamp(
      targetRect.left + targetRect.width / 2 - cardLeft - 8,
      20,
      cardWidth - 20,
    );

    return {
      cardTop,
      cardLeft,
      spotlight,
      arrow: {
        left: arrowLeft,
        top: placeAbove ? cardHeight - 2 : -8,
        direction: placeAbove ? "down" : "up",
      },
    };
  }, [cardHeight, targetRect]);

  return (
    <div className="pointer-events-auto fixed inset-0 z-[180]">
      <div className="absolute inset-0 bg-slate-950/10" />

      {layout.spotlight ? (
        <div
          className="absolute rounded-[1.4rem] border-2 border-cyan-300 shadow-[0_0_0_9999px_rgba(2,6,23,0.14),0_0_28px_rgba(34,211,238,0.28)] transition-all duration-300"
          style={{
            top: layout.spotlight.top,
            left: layout.spotlight.left,
            width: layout.spotlight.width,
            height: layout.spotlight.height,
          }}
        />
      ) : null}

      <div
        ref={cardRef}
        className="absolute w-[min(360px,calc(100vw-2rem))] rounded-[1.75rem] border border-white/15 bg-slate-950/88 p-5 text-white shadow-2xl"
        style={{
          top: layout.cardTop,
          left: layout.cardLeft,
        }}
      >
        {layout.arrow ? (
          <div
            className="absolute h-4 w-4 rotate-45 border border-white/15 bg-slate-950/96"
            style={{
              left: layout.arrow.left,
              top: layout.arrow.top,
              borderTopWidth: layout.arrow.direction === "up" ? 1 : 0,
              borderLeftWidth: layout.arrow.direction === "up" ? 1 : 0,
              borderBottomWidth: layout.arrow.direction === "down" ? 1 : 0,
              borderRightWidth: layout.arrow.direction === "down" ? 1 : 0,
            }}
          />
        ) : null}

        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
          Tutorial {stepIndex + 1} of {totalSteps}
        </p>
        <h2 className="mt-3 text-xl font-semibold leading-tight">{step.title}</h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">{step.body}</p>

        <button
          type="button"
          onClick={onNext}
          className="mt-5 w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/25"
        >
          {step.buttonLabel}
        </button>
      </div>
    </div>
  );
}

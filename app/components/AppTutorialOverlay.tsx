"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Screen } from "./Navigation";

export type AppTutorialStep = {
  screen: Screen;
  title: string;
  body: string;
  target: string;
  buttonLabel: string;
  placement?: "auto" | "above" | "below" | "center-below";
  spotlightShape?: "rounded" | "circle" | "box";
  cardOffset?: number;
  initialDelayMs?: number;
  spotlightPadding?: number;
  spotlightInset?: number;
  spotlightOffsetX?: number;
  spotlightOffsetY?: number;
  compactCard?: boolean;
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
  borderRadius?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function AppTutorialOverlay({ step, stepIndex, totalSteps, onNext }: Props) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const [isReadyToShow, setIsReadyToShow] = useState(false);

  useEffect(() => {
    const delay = step.initialDelayMs ?? 0;
    const resetTimeoutId = window.setTimeout(() => {
      setIsReadyToShow(false);
    }, 0);
    const revealTimeoutId = window.setTimeout(() => {
      setIsReadyToShow(true);
    }, Math.max(0, delay));

    return () => {
      window.clearTimeout(resetTimeoutId);
      window.clearTimeout(revealTimeoutId);
    };
  }, [step.initialDelayMs, step.target]);

  useEffect(() => {
    let frameId = 0;

    const updatePosition = () => {
      const targetElement = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-tutorial-target="${step.target}"]`),
      ).find((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      });

      if (!targetElement) {
        frameId = window.requestAnimationFrame(updatePosition);
        return;
      }

      const rect = targetElement.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(targetElement);
      setTargetRect((currentRect) => {
        const nextRect = {
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
          borderRadius: computedStyle.borderRadius,
        };

        if (
          currentRect &&
          Math.abs(currentRect.top - nextRect.top) < 0.5 &&
          Math.abs(currentRect.left - nextRect.left) < 0.5 &&
          Math.abs(currentRect.width - nextRect.width) < 0.5 &&
          Math.abs(currentRect.height - nextRect.height) < 0.5 &&
          currentRect.borderRadius === nextRect.borderRadius
        ) {
          return currentRect;
        }

        return nextRect;
      });
      frameId = window.requestAnimationFrame(updatePosition);
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
    const spotlightPadding = step.spotlightPadding ?? 10;
    const requestedPlacement = step.placement ?? "auto";
    const cardOffset = step.cardOffset ?? 22;
    const spotlightShape = step.spotlightShape ?? "rounded";
    const spotlightInset = step.spotlightInset ?? 0;
    const spotlightOffsetX = step.spotlightOffsetX ?? 0;
    const spotlightOffsetY = step.spotlightOffsetY ?? 0;

    if (!targetRect) {
      return {
        cardTop: viewportHeight - Math.max(cardHeight, 220) - 32,
        cardLeft: horizontalPadding,
        spotlight: null as Rect | null,
        arrow: null as { left: number; top: number; direction: "up" | "down" } | null,
      };
    }

    const spotlightSize = Math.max(targetRect.width, targetRect.height) + spotlightPadding * 2 - spotlightInset * 2;
    const spotlight = spotlightShape === "circle"
      ? {
        left: Math.max(12, targetRect.left + targetRect.width / 2 - spotlightSize / 2 + spotlightOffsetX),
        top: Math.max(12, targetRect.top + targetRect.height / 2 - spotlightSize / 2 + spotlightOffsetY),
        width: spotlightSize,
        height: spotlightSize,
      }
      : {
        top: Math.max(12, targetRect.top - spotlightPadding + spotlightOffsetY),
        left: Math.max(12, targetRect.left - spotlightPadding + spotlightOffsetX),
        width: targetRect.width + spotlightPadding * 2,
        height: targetRect.height + spotlightPadding * 2,
        borderRadius: targetRect.borderRadius,
      };

    const cardWidth = Math.min(360, viewportWidth - horizontalPadding * 2);
    const placeAbove = requestedPlacement === "above"
      ? true
      : requestedPlacement === "below" || requestedPlacement === "center-below"
        ? false
        : targetRect.top > viewportHeight * 0.55;
    const cardTop = placeAbove
      ? clamp(spotlight.top - cardHeight - cardOffset, 20, viewportHeight - cardHeight - 20)
      : requestedPlacement === "center-below"
        ? clamp(spotlight.top + spotlight.height + cardOffset, 20, viewportHeight - cardHeight - 20)
        : clamp(spotlight.top + spotlight.height + cardOffset, 20, viewportHeight - cardHeight - 20);
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
  }, [cardHeight, step.cardOffset, step.placement, step.spotlightInset, step.spotlightOffsetX, step.spotlightOffsetY, step.spotlightPadding, step.spotlightShape, targetRect]);

  return (
    <div className="pointer-events-auto fixed inset-0 z-[180]">
      <div className={`absolute inset-0 bg-slate-950/10 transition-opacity duration-150 ${isReadyToShow ? "opacity-100" : "opacity-0"}`} />

      {layout.spotlight ? (
        <div
          className={`absolute border-2 border-cyan-300 shadow-[0_0_0_9999px_rgba(2,6,23,0.14),0_0_28px_rgba(34,211,238,0.28)] transition-opacity duration-150 ${
            step.spotlightShape === "circle"
              ? "rounded-full"
              : step.spotlightShape === "box"
                ? "rounded-none"
                : "rounded-[1.4rem]"
          } ${isReadyToShow ? "opacity-100" : "opacity-0"}`}
          style={{
            top: layout.spotlight.top,
            left: layout.spotlight.left,
            width: layout.spotlight.width,
            height: layout.spotlight.height,
            borderRadius:
              step.spotlightShape === "circle"
                ? "9999px"
                : step.spotlightShape === "box"
                  ? "0px"
                  : layout.spotlight.borderRadius,
          }}
        />
      ) : null}

      <div
        ref={cardRef}
        className={`absolute w-[min(360px,calc(100vw-2rem))] border border-slate-200 bg-white text-black shadow-2xl transition-opacity duration-150 ${
          step.compactCard ? "rounded-[1.35rem] p-3.5" : "rounded-[1.75rem] p-5"
        } ${isReadyToShow ? "opacity-100" : "opacity-0"}`}
        style={{
          top: layout.cardTop,
          left: layout.cardLeft,
        }}
      >
        {layout.arrow ? (
          <div
            className="absolute h-4 w-4 rotate-45 border border-slate-200 bg-white"
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

        <p className={`${step.compactCard ? "text-[10px]" : "text-[11px]"} font-semibold uppercase tracking-[0.18em] text-cyan-600`}>
          Tutorial {stepIndex + 1} of {totalSteps}
        </p>
        <h2 className={`${step.compactCard ? "mt-2 text-base" : "mt-3 text-xl"} font-semibold leading-tight`}>{step.title}</h2>
        <p className={`${step.compactCard ? "mt-2 text-xs leading-5" : "mt-3 text-sm leading-6"} text-black`}>{step.body}</p>

        <button
          type="button"
          onClick={onNext}
          className={`${step.compactCard ? "mt-3 py-2.5 text-xs" : "mt-5 py-3 text-sm"} w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 px-4 font-semibold text-white shadow-lg shadow-cyan-500/25`}
        >
          {step.buttonLabel}
        </button>
      </div>
    </div>
  );
}

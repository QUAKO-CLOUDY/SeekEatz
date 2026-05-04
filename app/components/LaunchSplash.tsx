"use client";

import Image from "next/image";

type LaunchSplashProps = {
  statusText?: string;
};

export function LaunchSplash({ statusText = "Loading your experience" }: LaunchSplashProps) {
  return (
    <div className="splash-root relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b1322] text-white">
      <div className="absolute -left-24 top-[-10rem] h-72 w-72 rounded-full bg-cyan-500/20 blur-3xl splash-orb-a" />
      <div className="absolute -right-20 bottom-[-8rem] h-72 w-72 rounded-full bg-blue-500/20 blur-3xl splash-orb-b" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.08),transparent_45%),radial-gradient(circle_at_80%_80%,rgba(37,99,235,0.08),transparent_45%)]" />

      <div className="pointer-events-none absolute inset-0 z-[1] overflow-hidden" aria-hidden="true">
        <div className="splash-mini-card splash-mini-card-1"><span /><i /><i /></div>
        <div className="splash-mini-card splash-mini-card-2"><span /><i /><i /></div>
        <div className="splash-mini-card splash-mini-card-3"><span /><i /><i /></div>
        <div className="splash-mini-card splash-mini-card-4"><span /><i /><i /></div>
        <div className="splash-mini-card splash-mini-card-5"><span /><i /><i /></div>
        <div className="splash-mini-card splash-mini-card-6"><span /><i /><i /></div>
        <div className="splash-mini-card splash-mini-card-7"><span /><i /><i /></div>
        <div className="splash-mini-card splash-mini-card-8"><span /><i /><i /></div>
        <div className="splash-mini-card splash-mini-card-9"><span /><i /><i /></div>
        <div className="splash-mini-card splash-mini-card-10"><span /><i /><i /></div>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-col items-center px-8 text-center">
        <div className="splash-logo-shell">
          <div className="relative h-36 w-36 sm:h-44 sm:w-44 splash-logo-wrap">
            <Image
              src="/logos/seekeatz.png"
              alt="SeekEatz"
              fill
              priority
              className="object-contain"
            />
          </div>
        </div>

        <p className="mt-6 text-sm text-slate-300 sm:text-base splash-subtitle">Eat Smarter Anywhere</p>

        <div className="mt-8 h-1.5 w-44 overflow-hidden rounded-full bg-slate-800/80 splash-progress-shell">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 splash-progress" />
        </div>

        <p className="mt-4 text-xs uppercase tracking-[0.16em] text-slate-400 splash-status">{statusText}</p>
      </div>

      <style jsx>{`
        .splash-root {
          --start-delay: 1s;
        }

        .splash-orb-a {
          opacity: 0;
          animation: orbIn 420ms ease-out var(--start-delay) forwards, driftA 5.8s ease-in-out calc(var(--start-delay) + 420ms) infinite;
        }

        .splash-orb-b {
          opacity: 0;
          animation: orbIn 420ms ease-out var(--start-delay) forwards, driftB 6.2s ease-in-out calc(var(--start-delay) + 420ms) infinite;
        }

        .splash-mini-card {
          position: absolute;
          display: flex;
          flex-direction: column;
          gap: 5px;
          width: 44px;
          padding: 8px;
          border-radius: 10px;
          border: 1px solid rgba(148, 163, 184, 0.18);
          background: rgba(15, 23, 42, 0.26);
          backdrop-filter: blur(1px);
          opacity: 0;
          animation: miniCardReveal 900ms ease-out var(--reveal-delay) forwards, miniCardFloat 9s ease-in-out calc(var(--reveal-delay) + 900ms) infinite;
        }

        .splash-mini-card span {
          width: 12px;
          height: 12px;
          border-radius: 9999px;
          background: linear-gradient(135deg, rgba(56, 189, 248, 0.7), rgba(37, 99, 235, 0.7));
        }

        .splash-mini-card i {
          display: block;
          height: 4px;
          border-radius: 4px;
          background: rgba(148, 163, 184, 0.45);
        }

        .splash-mini-card i:last-child {
          width: 72%;
        }

        .splash-mini-card-1 {
          left: 12%;
          top: 18%;
          --reveal-delay: 0.35s;
        }

        .splash-mini-card-2 {
          left: 78%;
          top: 22%;
          --reveal-delay: 0.55s;
        }

        .splash-mini-card-3 {
          left: 20%;
          top: 66%;
          --reveal-delay: 1.1s;
        }

        .splash-mini-card-4 {
          left: 74%;
          top: 64%;
          --reveal-delay: 1.3s;
        }

        .splash-mini-card-5 {
          left: 8%;
          top: 42%;
          --reveal-delay: 1.85s;
        }

        .splash-mini-card-6 {
          left: 86%;
          top: 44%;
          --reveal-delay: 2.05s;
        }

        .splash-mini-card-7 {
          left: 32%;
          top: 12%;
          --reveal-delay: 2.6s;
        }

        .splash-mini-card-8 {
          left: 60%;
          top: 14%;
          --reveal-delay: 2.8s;
        }

        .splash-mini-card-9 {
          left: 30%;
          top: 80%;
          --reveal-delay: 3.35s;
        }

        .splash-mini-card-10 {
          left: 62%;
          top: 78%;
          --reveal-delay: 3.55s;
        }

        .splash-logo-shell {
          position: relative;
        }

        .splash-logo-wrap {
          animation: logoReveal 1300ms cubic-bezier(0.22, 1, 0.36, 1) var(--start-delay) both, logoFloat 2.4s ease-in-out calc(var(--start-delay) + 1.35s) infinite;
        }

        .splash-subtitle {
          animation: subtitleIn 900ms cubic-bezier(0.22, 1, 0.36, 1) calc(var(--start-delay) + 1460ms) both;
        }


        .splash-progress-shell {
          opacity: 0;
          animation: barShellIn 260ms ease-out calc(var(--start-delay) + 1900ms) forwards;
        }        .splash-progress {
          transform-origin: left;
          transform: scaleX(0);
          opacity: 0;
          animation: progressFill 1.8s linear calc(var(--start-delay) + 2000ms) infinite;
        }

        .splash-status {
          opacity: 0;
          animation: statusIn 420ms ease-out calc(var(--start-delay) + 1550ms) both;
        }

        @keyframes logoReveal {
          from {
            opacity: 0;
            transform: translateY(24px) scale(0.7);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes subtitleIn {
          from {
            opacity: 0;
            transform: translateY(22px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes barShellIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes statusIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes logoFloat {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-4px);
          }
        }

        @keyframes progressFill {
          0% {
            transform: scaleX(0);
            opacity: 0.85;
          }
          85% {
            transform: scaleX(1);
            opacity: 1;
          }
          100% {
            transform: scaleX(1);
            opacity: 1;
          }
        }

        @keyframes orbIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes miniCardReveal {
          from {
            opacity: 0;
            transform: translate3d(0, 10px, 0) scale(0.92);
          }
          to {
            opacity: 0.24;
            transform: translate3d(0, 0, 0) scale(1);
          }
        }

        @keyframes miniCardFloat {
          0%,
          100% {
            transform: translate3d(0, 0, 0) rotate(0deg);
          }
          35% {
            transform: translate3d(-5px, -8px, 0) rotate(-2deg);
          }
          70% {
            transform: translate3d(6px, 5px, 0) rotate(2deg);
          }
        }

        @keyframes driftA {
          0%,
          100% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(14px, 10px, 0);
          }
        }

        @keyframes driftB {
          0%,
          100% {
            transform: translate3d(0, 0, 0);
          }
          50% {
            transform: translate3d(-12px, -8px, 0);
          }
        }
      `}</style>
    </div>
  );
}









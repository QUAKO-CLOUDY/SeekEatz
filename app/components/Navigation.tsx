"use client";

import { Home, Activity, Sparkles, Heart, Settings as SettingsIcon } from "lucide-react";

export type Screen = "home" | "log" | "chat" | "favorites" | "settings" | "search";

type Props = {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
};

export function Navigation({ currentScreen, onNavigate }: Props) {
  const isAIChatActive = currentScreen === "chat";

  return (
    <nav className="fixed bottom-0 left-0 right-0 flex items-end justify-around px-2 pt-0.5 bg-card border-t border-border z-[100]" style={{ paddingBottom: `calc(0.25rem + env(safe-area-inset-bottom, 0px))` }}>
      {/* Home */}
      <button
        onClick={() => onNavigate("home")}
        className="flex flex-col items-center gap-0.5 py-1 px-2 transition-all flex-1"
      >
        <div
          className={`p-1.5 rounded-lg ${
            currentScreen === "home" ? "bg-muted" : ""
          }`}
        >
          <Home
            className={`w-4 h-4 ${
              currentScreen === "home" ? "text-cyan-400" : "text-muted-foreground"
            }`}
          />
        </div>
        <span
          className={`text-[10px] ${
            currentScreen === "home" ? "text-cyan-400" : "text-muted-foreground"
          }`}
        >
          Home
        </span>
      </button>

      {/* Log */}
      <button
        onClick={() => onNavigate("log")}
        className="flex flex-col items-center gap-0.5 py-1 px-2 transition-all flex-1"
      >
        <div
          className={`p-1.5 rounded-lg ${
            currentScreen === "log" ? "bg-muted" : ""
          }`}
        >
          <Activity
            className={`w-4 h-4 ${
              currentScreen === "log" ? "text-green-400" : "text-muted-foreground"
            }`}
          />
        </div>
        <span
          className={`text-[10px] ${
            currentScreen === "log" ? "text-green-400" : "text-muted-foreground"
          }`}
        >
          Log
        </span>
      </button>

      {/* Center AI Chat FAB */}
      <div className="flex flex-col items-center flex-1 pb-0.5">
        <button
          onClick={() => onNavigate("chat")}
          className="relative group"
        >
          {/* Cyan/blue glow layers */}
          <div
            className="absolute inset-0 rounded-full opacity-60 group-hover:opacity-80 transition-opacity"
            style={{
              background:
                "radial-gradient(circle, rgba(6,182,212,0.6) 0%, rgba(59,130,246,0.4) 50%, transparent 70%)",
              filter: "blur(16px)",
              transform: "scale(1.5)",
            }}
          />
          <div
            className="absolute inset-0 rounded-full opacity-70 group-hover:opacity-90 transition-opacity"
            style={{
              boxShadow:
                "0 0 24px 5px rgba(6,182,212,0.6), 0 0 48px 10px rgba(59,130,246,0.4)",
            }}
          />

          {/* Main FAB */}
          <div
            className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-all ${
              isAIChatActive ? "scale-105" : "scale-100"
            }`}
            style={{
              background:
                "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
              boxShadow:
                "0 4px 20px rgba(6,182,212,0.5), 0 2px 10px rgba(59,130,246,0.3), inset 0 1px 0 rgba(255,255,255,0.3)",
            }}
          >
            <Sparkles className="w-5 h-5 text-white" strokeWidth={2.5} />

            {/* Active ring pulse */}
            {isAIChatActive && (
              <div className="absolute inset-0 rounded-full border-2 border-white/40 animate-ping" />
            )}
          </div>
        </button>
        <span
          className={`text-[10px] font-medium ${
            isAIChatActive ? "text-cyan-400" : "text-muted-foreground"
          }`}
        >
          AI Chat
        </span>
      </div>

      {/* Favorites */}
      <button
        onClick={() => onNavigate("favorites")}
        className="flex flex-col items-center gap-0.5 py-1 px-2 transition-all flex-1"
      >
        <div
          className={`p-1.5 rounded-lg ${
            currentScreen === "favorites" ? "bg-muted" : ""
          }`}
        >
          <Heart
            className={`w-4 h-4 ${
              currentScreen === "favorites"
                ? "text-pink-400"
                : "text-muted-foreground"
            }`}
          />
        </div>
        <span
          className={`text-[10px] ${
            currentScreen === "favorites" ? "text-pink-400" : "text-muted-foreground"
          }`}
        >
          Favorites
        </span>
      </button>

      {/* Settings */}
      <button
        onClick={() => onNavigate("settings")}
        className="flex flex-col items-center gap-0.5 py-1 px-2 transition-all flex-1"
      >
        <div
          className={`p-1.5 rounded-lg ${
            currentScreen === "settings" ? "bg-muted" : ""
          }`}
        >
          <SettingsIcon
            className={`w-4 h-4 ${
              currentScreen === "settings"
                ? "text-foreground"
                : "text-muted-foreground"
            }`}
          />
        </div>
        <span
          className={`text-[10px] ${
            currentScreen === "settings" ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          Settings
        </span>
      </button>
    </nav>
  );
}

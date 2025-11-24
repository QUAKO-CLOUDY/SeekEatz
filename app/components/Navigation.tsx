"use client";

import { Home, MessageSquare, Heart, Settings } from 'lucide-react';

type Screen = 'home' | 'chat' | 'favorites' | 'settings';

type Props = {
  currentScreen: Screen;
  onNavigate: (screen: Screen) => void;
};

export function Navigation({ currentScreen, onNavigate }: Props) {
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'chat', label: 'AI Chat', icon: MessageSquare },
    { id: 'favorites', label: 'Saved', icon: Heart },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <div className="flex justify-around items-center p-4 bg-gray-900 border-t border-gray-800 pb-8">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentScreen === item.id;
        
        return (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
            className={`flex flex-col items-center gap-1 transition-colors duration-200 ${
              isActive ? 'text-cyan-400' : 'text-gray-500 hover:text-gray-400'
            }`}
          >
            <Icon className={`w-6 h-6 ${isActive ? 'fill-cyan-400/20' : ''}`} />
            <span className="text-[10px] font-medium">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
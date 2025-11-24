// Consistent macro colors across the entire app
export const MACRO_COLORS = {
  protein: {
    light: '#2563eb', // blue-600
    dark: '#3b82f6', // blue-500
    gradient: {
      from: '#3b82f6',
      to: '#06b6d4',
    },
    ring: 'from-blue-500 to-cyan-500',
  },
  carbs: {
    light: '#16a34a', // green-600
    dark: '#22c55e', // green-500
    gradient: {
      from: '#22c55e',
      to: '#10b981',
    },
    ring: 'from-green-500 to-emerald-500',
  },
  fats: { // UPDATED: Changed to 'fats' to match your types.ts
    light: '#d97706', // amber-600 (warm orange, not yellow)
    dark: '#f59e0b', // amber-500
    gradient: {
      from: '#f59e0b',
      to: '#d97706',
    },
    ring: 'from-amber-500 to-orange-600',
  },
  calories: {
    light: '#dc2626', // red-600
    dark: '#ef4444', // red-500
    gradient: {
      from: '#f97316',
      to: '#ef4444',
    },
    ring: 'from-orange-500 to-red-500',
  },
} as const;

// Theme-aware background and text colors
export const THEME_COLORS = {
  light: {
    bg: {
      primary: 'bg-white',
      secondary: 'bg-gray-50',
      card: 'bg-white',
      input: 'bg-gray-50',
      hover: 'hover:bg-gray-100',
    },
    text: {
      primary: 'text-gray-900',
      secondary: 'text-gray-600',
      muted: 'text-gray-500',
    },
    border: {
      primary: 'border-gray-200',
      secondary: 'border-gray-300',
    },
    accent: {
      almond: '#E8DCC4',
      wood: '#C4A57B',
      tan: '#D2B48C',
    },
  },
  dark: {
    bg: {
      primary: 'bg-gray-950',
      secondary: 'bg-gray-900',
      card: 'bg-gradient-to-br from-gray-900 to-gray-800',
      input: 'bg-gray-900',
      hover: 'hover:bg-gray-800',
    },
    text: {
      primary: 'text-white',
      secondary: 'text-gray-300',
      muted: 'text-gray-500',
    },
    border: {
      primary: 'border-gray-700',
      secondary: 'border-gray-800',
    },
  },
} as const;
import React from 'react';
import { getLogo } from '@/utils/logos';

type MacroMap = {
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null; // Use "fats" (plural) to match Meal type
};

type FoodItem = {
  name: string;
  category: string;
  macros: MacroMap;
  image_url?: string | null;
};

type Props = {
  item: FoodItem;
  restaurantName: string;
};

export default function FoodCard({ item, restaurantName }: Props) {
  // Safe check for macros in case they are null
  const protein = item.macros.protein ?? 0;
  const cals = item.macros.calories ?? 0;
  const carbs = item.macros.carbs ?? 0;

  return (
    <div className="flex items-center gap-4 p-4 border rounded-lg bg-white shadow-sm mb-3 hover:shadow-md transition-shadow cursor-pointer">
      {/* Logo Section */}
      <img
        src={getLogo(restaurantName)}
        alt={restaurantName || 'Restaurant logo'}
        className="h-12 w-12 object-contain flex-shrink-0"
        onError={(e) => {
          // Fallback to default.png if logo fails to load
          if (e.currentTarget.src !== window.location.origin + '/logos/default.png') {
            e.currentTarget.onerror = null; // Prevent infinite loop
            e.currentTarget.src = '/logos/default.png';
          } else {
            // If default.png also fails, hide the image
            e.currentTarget.style.display = 'none';
          }
        }}
      />

      {/* Info Section */}
      <div className="flex-1">
        <h3 className="font-bold text-gray-900 line-clamp-1">{item.name}</h3>
        <p className="text-xs text-gray-500 mb-2">{item.category}</p>
        
        {/* Macro Badges */}
        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">
            {protein}g Pro
          </span>
          <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded">
            {cals} Cals
          </span>
          {/* Only show carbs if you have space, optional */}
          <span className="bg-green-100 text-green-700 px-2 py-1 rounded hidden sm:inline-block">
            {carbs}g Carb
          </span>
        </div>
      </div>
    </div>
  );
}
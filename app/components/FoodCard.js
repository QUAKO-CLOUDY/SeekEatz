import { getLogo } from '@/utils/logos';
import Image from 'next/image';

export default function FoodCard({ item, restaurantName }) {
  const logoPath = getLogo(restaurantName);

  // Helper function to format macro values
  const formatMacro = (value) => {
    if (value === null || value === undefined) {
      return 'N/A';
    }
    return value.toString();
  };

  return (
    <div className="flex items-center gap-4 bg-white rounded-lg shadow-sm p-4">
      {/* Left Side - Logo */}
      <div className="flex-shrink-0">
        <Image
          src={logoPath}
          alt={restaurantName || 'Restaurant'}
          width={48}
          height={48}
          className="w-12 h-12 object-contain"
          onError={(e) => {
            // Fallback to default.png if logo fails to load
            if (logoPath !== '/logos/default.png') {
              e.currentTarget.onerror = null; // Prevent infinite loop
              e.currentTarget.src = '/logos/default.png';
            } else {
              // If default.png also fails, hide the image
              e.currentTarget.style.display = 'none';
            }
          }}
        />
      </div>

      {/* Right Side - Content */}
      <div className="flex-1 min-w-0">
        {/* Name */}
        <h3 className="font-bold text-base mb-1 truncate">
          {item.item_name || item.name || 'Unknown Item'}
        </h3>

        {/* Category */}
        <p className="text-sm text-gray-500 mb-2">
          {item.category || 'Uncategorized'}
        </p>

        {/* Macro Badges Row */}
        <div className="flex flex-wrap gap-2">
          {/* Protein Badge */}
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-100 text-blue-800">
            Protein: {formatMacro(item.protein_g || item.protein)}
          </span>

          {/* Calories Badge */}
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
            Calories: {formatMacro(item.calories)}
          </span>

          {/* Carbs Badge */}
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-green-100 text-green-800">
            Carbs: {formatMacro(item.carbs_g || item.carbs)}
          </span>

          {/* Fat Badge */}
          <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-yellow-100 text-yellow-800">
            Fat: {formatMacro(item.fat_g || item.fats || item.fat)}
          </span>
        </div>
      </div>
    </div>
  );
}

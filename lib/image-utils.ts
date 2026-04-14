import { getLogo } from '@/utils/logos';

/**
 * Generates a real food image URL based on meal name and restaurant
 * Uses Unsplash Source API (free, no API key required)
 */

/**
 * Cleans and formats meal name for image search
 */
function formatMealNameForSearch(mealName: string): string {
  // Remove common prefixes/suffixes and clean up
  return mealName
    .toLowerCase()
    .replace(/\s+(bol|bowl|salad|wrap|burrito|taco|quesadilla|plate|meal)$/i, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3) // Take first 3 words
    .join('+');
}

/**
 * Gets restaurant-specific food keywords for better image matching
 */
function getRestaurantKeywords(restaurant: string): string {
  const restaurantLower = restaurant.toLowerCase();
  
  // Mediterranean/Middle Eastern
  if (restaurantLower.includes('cava') || restaurantLower.includes('bolay')) {
    return 'mediterranean+bowl+healthy';
  }
  
  // Mexican
  if (restaurantLower.includes('chipotle') || restaurantLower.includes('tocaya')) {
    return 'mexican+bowl+burrito';
  }
  
  // Salad-focused
  if (restaurantLower.includes('sweetgreen') || 
      restaurantLower.includes('chopt') || 
      restaurantLower.includes('justsalad') ||
      restaurantLower.includes('saladandgo') ||
      restaurantLower.includes('madgreens') ||
      restaurantLower.includes('tendergreens')) {
    return 'fresh+salad+bowl';
  }
  
  // Asian
  if (restaurantLower.includes('bibibop')) {
    return 'korean+bowl+rice';
  }
  
  // General healthy
  if (restaurantLower.includes('flowerchild') || 
      restaurantLower.includes('freshkitchen')) {
    return 'healthy+bowl+vegetables';
  }
  
  return 'food+meal+healthy';
}

/**
 * Generates a food image URL using Unsplash
 * Creates image URLs based on meal name and restaurant
 * @param mealName - Name of the meal
 * @param restaurant - Name of the restaurant
 * @param width - Image width (default: 600)
 * @param height - Image height (default: 400)
 */
export function generateFoodImageUrl(
  mealName: string,
  restaurant: string = '',
  width: number = 600,
  height: number = 400
): string {
  // Format keywords for image search
  const mealKeywords = formatMealNameForSearch(mealName);
  const restaurantKeywords = getRestaurantKeywords(restaurant);
  
  // Build search query - prioritize meal-specific keywords
  const searchTerms = mealKeywords 
    ? `${mealKeywords},food,healthy,restaurant` 
    : `${restaurantKeywords},food,healthy,meal`;
  
  // Use Unsplash Source API (featured endpoint for better quality)
  // Format: https://source.unsplash.com/featured/{width}x{height}/?{keywords}
  // Note: This endpoint may have rate limits but works without API key
  return `https://source.unsplash.com/featured/${width}x${height}/?${searchTerms}`;
}

/**
 * Alternative: Use a food image service as fallback
 * This uses Lorem Picsum with food category (if available)
 */
export function generateFoodImageUrlFromCollection(
  mealName: string,
  restaurant: string = '',
  width: number = 600,
  height: number = 400
): string {
  void width;
  void height;
  // Create a hash for consistent image selection
  let hash = 0;
  const mealKey = `${mealName}-${restaurant}`;
  for (let i = 0; i < mealKey.length; i++) {
    hash = mealKey.charCodeAt(i) + ((hash << 5) - hash);
  }
  const seed = Math.abs(hash);
  
  // Use a food image placeholder service
  // Foodish API provides random food images (limited but free)
  // Format: https://foodish-api.herokuapp.com/images/{category}/{category}{number}.jpg
  const categories = ['biryani', 'burger', 'butter-chicken', 'dessert', 'dosa', 'idly', 'pasta', 'pizza', 'rice', 'samosa'];
  const category = categories[seed % categories.length];
  const imageNum = (seed % 10) + 1;
  
  return `https://foodish-api.herokuapp.com/images/${category}/${category}${imageNum}.jpg`;
}

/**
 * Fallback: Use a food placeholder service if Unsplash fails
 */
export function getFoodPlaceholderUrl(
  mealName: string,
  width: number = 600,
  height: number = 400
): string {
  void width;
  void height;
  // Using Foodish API as a backup (free food images)
  const encodedName = encodeURIComponent(mealName.toLowerCase().split(' ')[0]);
  return `https://foodish-api.herokuapp.com/images/${encodedName}/${encodedName}${Math.floor(Math.random() * 10)}.jpg`;
}

/**
 * Maps meal names to local static images
 * Returns a local image path if a match exists, null otherwise
 */
function getLocalMealImage(mealName: string, restaurant: string = ''): string | null {
  const nameLower = mealName.toLowerCase();
  const restaurantLower = restaurant.toLowerCase();
  
  // Create a mapping of meal keywords to local image files
  const imageMap: Record<string, string> = {
    // Chicken dishes
    'chicken': '/images/meals/grilled-chicken-bowl.jpg',
    'grilled chicken': '/images/meals/grilled-chicken-bowl.jpg',
    'chicken bowl': '/images/meals/grilled-chicken-bowl.jpg',
    'chicken burrito': '/images/meals/chicken-burrito.jpg',
    'chicken salad': '/images/meals/chicken-salad.jpg',
    
    // Salmon dishes
    'salmon': '/images/meals/salmon-bowl.jpg',
    'salmon bowl': '/images/meals/salmon-bowl.jpg',
    'salmon rice': '/images/meals/salmon-bowl.jpg',
    
    // Beef dishes
    'beef': '/images/meals/beef-bowl.jpg',
    'steak': '/images/meals/beef-bowl.jpg',
    'beef bowl': '/images/meals/beef-bowl.jpg',
    'beef burrito': '/images/meals/beef-burrito.jpg',
    
    // Vegetarian/Vegan
    'veggie': '/images/meals/veggie-bowl.jpg',
    'vegetable': '/images/meals/veggie-bowl.jpg',
    'veggie burrito': '/images/meals/veggie-burrito.jpg',
    'veggie bowl': '/images/meals/veggie-bowl.jpg',
    'vegan': '/images/meals/veggie-bowl.jpg',
    
    // Salad dishes
    'salad': '/images/meals/salad-bowl.jpg',
    'caesar': '/images/meals/salad-bowl.jpg',
    'greek salad': '/images/meals/salad-bowl.jpg',
    
    // Mexican dishes
    'burrito': '/images/meals/burrito.jpg',
    'taco': '/images/meals/tacos.jpg',
    'quesadilla': '/images/meals/quesadilla.jpg',
    'bowl': '/images/meals/default-bowl.jpg',
    
    // Asian dishes
    'rice bowl': '/images/meals/rice-bowl.jpg',
    'teriyaki': '/images/meals/teriyaki-bowl.jpg',
    'korean': '/images/meals/korean-bowl.jpg',
    
    // Mediterranean
    'mediterranean': '/images/meals/mediterranean-bowl.jpg',
    'hummus': '/images/meals/mediterranean-bowl.jpg',
    'falafel': '/images/meals/falafel-bowl.jpg',
  };
  
  // Check for exact matches first
  for (const [keyword, imagePath] of Object.entries(imageMap)) {
    if (nameLower.includes(keyword)) {
      return imagePath;
    }
  }
  
  // Restaurant-specific defaults
  if (restaurantLower.includes('chipotle') || restaurantLower.includes('tocaya')) {
    return '/images/meals/default-mexican.jpg';
  }
  if (restaurantLower.includes('cava') || restaurantLower.includes('bolay')) {
    return '/images/meals/default-mediterranean.jpg';
  }
  if (restaurantLower.includes('sweetgreen') || restaurantLower.includes('chopt') || 
      restaurantLower.includes('justsalad') || restaurantLower.includes('saladandgo')) {
    return '/images/meals/default-salad.jpg';
  }
  
  return null;
}

/**
 * Main function to get the best available food image
 * Priority: existing URL > local static image > Unsplash > default placeholder
 */
export function getMealImageUrl(
  mealName: string,
  restaurant: string = '',
  existingImageUrl?: string | null
): string {
  // If there's already an image URL and it's not a placeholder, use it
  if (existingImageUrl && 
      !existingImageUrl.includes('placeholder') && 
      !existingImageUrl.includes('placehold.co') &&
      !existingImageUrl.startsWith('/') &&
      existingImageUrl.startsWith('http')) {
    return existingImageUrl;
  }
  
  // Try local static image first
  const localImage = getLocalMealImage(mealName, restaurant);
  if (localImage) {
    return localImage;
  }
  
  // Fallback to Unsplash-generated image
  // Note: Unsplash Source API may have rate limits, but provides good quality images
  return generateFoodImageUrl(mealName, restaurant);
}

export function getRestaurantLogoUrl(
  restaurant: string = '',
  logoUrl?: string | null
): string {
  if (
    logoUrl &&
    logoUrl.startsWith('http') &&
    !logoUrl.includes('placeholder')
  ) {
    return logoUrl;
  }

  return getLogo(restaurant);
}

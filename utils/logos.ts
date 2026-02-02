// Mapping for restaurant names that don't match logo filenames exactly
// This handles variations in how restaurant names are stored vs. logo filenames
const RESTAURANT_LOGO_MAP: Record<string, string> = {
  // Dunkin variations
  'dunkin\'': 'dunkin_donuts',
  'dunkin': 'dunkin_donuts',
  'dunkin donuts': 'dunkin_donuts',
  'dunkin\' donuts': 'dunkin_donuts',
  
  // Habit Burger variations
  'the habit burger grill': 'habit_burger',
  'the habit burger and grill': 'habit_burger',
  'the_habit_burger_and_grill': 'habit_burger',
  'habit burger grill': 'habit_burger',
  'habit burger and grill': 'habit_burger',
  'habit burger': 'habit_burger',
  
  // In-N-Out variations
  'in-n-out burger': 'in_n_out',
  'in-n-out': 'in_n_out',
  'in n out burger': 'in_n_out',
  'in n out': 'in_n_out',
  
  // Chick-fil-A variations
  'chick-fil-a': 'chick_fil_a',
  'chick fil a': 'chick_fil_a',
  
  // Moe's variations
  'moe\'s southwest grill': 'moes_southwest_grill',
  'moes southwest grill': 'moes_southwest_grill',
  'moe\'s': 'moes_southwest_grill',
  
  // Raising Cane's variations
  'raising cane\'s': 'raising_canes',
  'raising canes': 'raising_canes',
  
  // Jersey Mike's variations
  'jersey mike\'s': 'jersey_mikes',
  'jersey mikes': 'jersey_mikes',
  
  // Jimmy John's variations
  'jimmy john\'s': 'jimmy_johns',
  'jimmy johns': 'jimmy_johns',
  
  // McDonald's variations
  'mcdonald\'s': 'mcdonalds',
  'mcdonalds': 'mcdonalds',
  
  // Culver's variations
  'culver\'s': 'culvers',
  'culvers': 'culvers',
  
  // Wendy's variations
  'wendy\'s': 'wendys',
  'wendys': 'wendys',
  
  // Zaxby's variations
  'zaxby\'s': 'zaxbys',
  'zaxbys': 'zaxbys',
  
  // Domino's variations
  'domino\'s pizza': 'dominos',
  'domino\'s': 'dominos',
  'dominos pizza': 'dominos',
  'dominos': 'dominos',
  'domino_pizza': 'dominos',
  
  // Salad and Go variations
  'salad and go': 'salad_and_go',
  'salad & go': 'salad_and_go',
  'saladandgo': 'salad_and_go',
  'salad_and_go': 'salad_and_go',
  
  // Just Salad variations
  'just salad': 'just_salad',
  'justsalad': 'just_salad',
  'just_salad': 'just_salad',
  
  // Chopt Creative Salad Co. variations
  'chopt creative salad co': 'chopt',
  'chopt creative salad co.': 'chopt',
  'chopt creative salad company': 'chopt',
  'chopt_creative_salad_co': 'chopt',
  'chopt': 'chopt',
  
  // Dig Inn variations
  'dig inn': 'dig_inn',
  'dig_inn': 'dig_inn',
  
  // Whataburger variations
  'whataburger': 'whataburger-',
  'what a burger': 'whataburger-',
  
  // Jersey Mike's Subs variations
  'jersey mike\'s subs': 'jersey_mikes',
  'jersey mikes subs': 'jersey_mikes',
  
  // Chipotle variations
  'chipotle mexican grill': 'chipotle',
  'chipotle': 'chipotle',
  
  // Clean Eatz variations
  'clean eatz': 'cleaneatz',
  'cleaneatz': 'cleaneatz',
  
  // Muscle Maker Grill variations
  'muscle maker grill': 'muscle_maker',
  'muscle maker': 'muscle_maker',
  
  // Pei Wei variations
  'pei wei asian kitchen': 'pei_wei',
  'pei wei': 'pei_wei',
  
  // QDOBA variations
  'qdoba mexican eats': 'qdoba',
  'qdoba': 'qdoba',
  
  // Tropical Smoothie Cafe variations
  'tropical smoothie cafe': 'tropical_smoothie',
  'tropical smoothie': 'tropical_smoothie',
  
  // Taziki's variations
  'taziki\'s mediterranean cafe': 'tazikis',
  'taziki\'s': 'tazikis',
  'tazikis': 'tazikis',
  
  // Steak 'n Shake variations
  'steak \'n shake': 'steak_and_shake',
  'steak n shake': 'steak_and_shake',
  'steak and shake': 'steak_and_shake',
  
  // Sonic variations
  'sonic drive-in': 'sonic',
  'sonic drive in': 'sonic',
  'sonic': 'sonic',
  
  // Arby's variations
  'arby\'s': 'arbys',
  'arbys': 'arbys',
  
  // Playa Bowls variations
  'playa bowls': 'playa_bowls',
  'playa_bowls': 'playa_bowls',
  
  // Pollo Tropical variations
  'pollo tropical': 'pollo_tropical',
  'pollo_tropical': 'pollo_tropical',
  
  // WaBa Grill variations
  'waba grill': 'waba_grill',
  'waba_grill': 'waba_grill',
  
  // Popeyes variations
  'popeyes': 'popeyes',
  'popeyes louisiana kitchen': 'popeyes',
  
  // Panera Bread variations
  'panera bread': 'panera_bread',
  'panera': 'panera_bread',
  'panera_bread': 'panera_bread',
  
  // Panda Express variations
  'panda express': 'panda_express',
  'panda_express': 'panda_express',
  
  // PDQ variations
  'pdq': 'pdq',
  
  // Five Guys variations
  'five guys': 'five_guys',
  'five guys burgers and fries': 'five_guys',
  'five_guys': 'five_guys',
  
  // Firehouse Subs variations
  'firehouse subs': 'firehouse_subs',
  'firehouse_subs': 'firehouse_subs',
  
  // El Pollo Loco variations
  'el pollo loco': 'el_pollo_loco',
  'el_pollo_loco': 'el_pollo_loco',
  
  // Burger King variations
  'burger king': 'burger_king',
  'burger_king': 'burger_king',
  
  // CAVA variations
  'cava': 'cava',
  
  // Carrot Express variations
  'carrot express': 'carrot_express',
  'carrot_express': 'carrot_express',
  
  // KFC variations
  'kfc': 'kfc',
  'kentucky fried chicken': 'kfc',
  
  // Subway variations
  'subway': 'subway',
  
  // Sweetgreen variations
  'sweetgreen': 'sweetgreen',
  
  // Taco Bell variations
  'taco bell': 'taco_bell',
  'taco_bell': 'taco_bell',
  
  // Starbucks variations
  'starbucks': 'starbucks',
  
  // Smashburger variations
  'smashburger': 'smashburger',
  
  // True Food Kitchen variations
  'true food kitchen': 'true_food_kitchen',
  'true_food_kitchen': 'true_food_kitchen',
  
  // Wingstop variations
  'wingstop': 'wingstop',
  
  // Shake Shack - no logo available, use default
  'shake shack': 'default',
  'shake_shack': 'default',
};
// utils/logos.ts
export const getLogo = (restaurantName: string | null | undefined) => {
  // 1. Handle missing data gracefully - always fallback to default
  if (!restaurantName) return '/logos/default.png'; 

  // 2. Normalize the name for lookup
  // First, try to match against RESTAURANT_LOGO_MAP (which may have apostrophes)
  // Normalize: lowercase, replace & with and, preserve apostrophes for map lookup
  const forMapLookup = restaurantName
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and');
  
  // Check exact match first (handles cases like "mcdonald's" in the map)
  if (RESTAURANT_LOGO_MAP[forMapLookup]) {
    return `/logos/${RESTAURANT_LOGO_MAP[forMapLookup]}.png`;
  }
  
  // Also check normalized version without apostrophes (handles "mcdonalds" -> "mcdonalds" in map)
  const normalizedForMap = forMapLookup
    .replace(/'/g, '')           // Remove apostrophes
    .replace(/[^\w\s]/g, '')     // Remove all remaining punctuation
    .replace(/\s+/g, '_')        // Replace spaces with underscores
    .replace(/_+/g, '_')         // Collapse multiple underscores
    .replace(/^_|_$/g, '');      // Remove leading/trailing underscores
  
  if (RESTAURANT_LOGO_MAP[normalizedForMap]) {
    return `/logos/${RESTAURANT_LOGO_MAP[normalizedForMap]}.png`;
  }
  
  // 3. If no mapping found, normalize for file path generation
  // Normalization: lowercase, remove apostrophes, replace & with and, remove punctuation, collapse spaces, replace spaces with underscores
  const normalized = restaurantName
    .toLowerCase()
    .trim()
    .replace(/'/g, '')           // Remove apostrophes
    .replace(/&/g, 'and')        // Replace "&" with "and"
    .replace(/[^\w\s]/g, '')     // Remove all remaining punctuation
    .replace(/\s+/g, '_')        // Replace spaces with underscores
    .replace(/_+/g, '_')         // Collapse multiple underscores
    .replace(/^_|_$/g, '');      // Remove leading/trailing underscores

  // 4. Fallback: Auto-generate slug from normalized name
  // Already normalized above, so just use it
  const logoPath = `/logos/${normalized}.png`;
  
  // Note: We return the path even if file doesn't exist
  // The image onError handler in components will fallback to /logos/default.png
  // This prevents 404 spam in logs while still allowing dynamic logo resolution
  return logoPath;
};


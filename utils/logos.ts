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
  'chopt creative salad co': 'chopt_creative_salad',
  'chopt creative salad co.': 'chopt_creative_salad',
  'chopt creative salad company': 'chopt_creative_salad',
  'chopt_creative_salad_co': 'chopt_creative_salad',
  'chopt': 'chopt_creative_salad',

  // Cheba Hut variations
  'cheba hut': 'Cheeba hut',
  'cheeba hut': 'Cheeba hut',
  'cheba_hut': 'Cheeba hut',
  'cheeba_hut': 'Cheeba hut',

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

  // Shake Shack variations
  'shake shack': 'shakeshack',
  'shake_shack': 'shakeshack',

  // 3 Natives variations
  '3 natives': '3 natives',
  '3natives': '3 natives',

  // Another Broken Egg Cafe variations
  'another broken egg cafe': 'Another Broken Egg Cafe',
  'another broken egg': 'Another Broken Egg Cafe',

  // BJ\'s Restaurant variations
  'bj\'s restaurant & brewhouse': 'BJ\'s_Restaurant_&_Brewhouse',
  'bj\'s restaurant and brewhouse': 'BJ\'s_Restaurant_&_Brewhouse',
  'bj\'s brewhouse': 'BJ\'s_Restaurant_&_Brewhouse',
  'bjs restaurant': 'BJ\'s_Restaurant_&_Brewhouse',
  'bj\'s': 'BJ\'s_Restaurant_&_Brewhouse',
  'bjs': 'BJ\'s_Restaurant_&_Brewhouse',

  // Bertucci\'s variations
  'bertucci\'s': 'Bertuccis',
  'bertuccis': 'Bertuccis',
  'bertucci\'s italian restaurant': 'Bertuccis',

  // Black Bear Diner variations
  'black bear diner': 'Black Bear Diner',

  // Bonefish Grill variations
  'bonefish grill': 'Bonefish grill',

  // Capriotti\'s Sandwich Shop variations
  'capriotti\'s sandwich shop': 'Capriotti\'s Sandwich Shop',
  'capriottis sandwich shop': 'Capriotti\'s Sandwich Shop',
  'capriotti\'s': 'Capriotti\'s Sandwich Shop',
  'capriottis': 'Capriotti\'s Sandwich Shop',

  // Carrabba\'s Italian Grill variations
  'carrabba\'s italian grill': 'Carrabba\'s Italian Grill',
  'carrabbas italian grill': 'Carrabba\'s Italian Grill',
  'carrabba\'s': 'Carrabba\'s Italian Grill',
  'carrabbas': 'Carrabba\'s Italian Grill',

  // Eddie V\'s Prime Seafood variations
  'eddie v\'s prime seafood': 'Eddie V\'s prime Seafood',
  'eddie vs prime seafood': 'Eddie V\'s prime Seafood',
  'eddie v\'s': 'Eddie V\'s prime Seafood',

  // Einstein Bros Bagels variations
  'einstein bros bagels': 'Einstein Bros Bagels',
  'einstein bros. bagels': 'Einstein Bros Bagels',
  'einstein bagels': 'Einstein Bros Bagels',
  'einstein brothers bagels': 'Einstein Bros Bagels',

  // Flower Child variations
  'flower child': 'Flower child',

  // Hopdoddy Burger Bar variations
  'hopdoddy burger bar': 'Hopdoddy Burger Bar',
  'hopdoddy': 'Hopdoddy Burger Bar',

  // Jinya Ramen Bar variations
  'jinya ramen bar': 'Jinya Ramen Bar',
  'jinya ramen': 'Jinya Ramen Bar',
  'jinya': 'Jinya Ramen Bar',

  // Lazy Dog variations
  'lazy dog restaurant & bar': 'Lazy Dog',
  'lazy dog restaurant and bar': 'Lazy Dog',
  'lazy dog': 'Lazy Dog',

  // Lucille\'s Smokehouse BBQ variations
  'lucille\'s smokehouse bar-b-que': 'Lucille\'s smokehouse BBQ',
  'lucille\'s smokehouse bbq': 'Lucille\'s smokehouse BBQ',
  'lucilles smokehouse bbq': 'Lucille\'s smokehouse BBQ',
  'lucille\'s': 'Lucille\'s smokehouse BBQ',

  // Maggiano\'s Little Italy variations
  'maggiano\'s little italy': 'Maggios little Italy',
  'maggianos little italy': 'Maggios little Italy',
  'maggiano\'s': 'Maggios little Italy',
  'maggianos': 'Maggios little Italy',

  // McAlister\'s Deli variations
  'mcalister\'s deli': 'McAlister\'s Deli',
  'mcalisters deli': 'McAlister\'s Deli',
  'mcalister\'s': 'McAlister\'s Deli',
  'mcalisters': 'McAlister\'s Deli',

  // Newk\'s Eatery variations
  'newk\'s eatery': 'Newks Eatery',
  'newks eatery': 'Newks Eatery',
  'newk\'s': 'Newks Eatery',

  // Noah\'s Bagels variations
  'noah\'s bagels': 'Noah\'s Bagels',
  'noahs bagels': 'Noah\'s Bagels',
  'noah\'s new york bagels': 'Noah\'s Bagels',

  // Paris Baguette variations
  'paris baguette': 'Paris Baguette',

  // Sonny\'s BBQ variations
  'sonny\'s bbq': 'Sonnys',
  'sonnys bbq': 'Sonnys',
  'sonny\'s real pit bar-b-q': 'Sonnys',
  'sonny\'s': 'Sonnys',
  'sonnys': 'Sonnys',

  // Sweetfin variations
  'sweetfin': 'Sweetfin',
  'sweetfin poke': 'Sweetfin',

  // The Original Pancake House variations
  'the original pancake house': 'The Original Pancake House',
  'original pancake house': 'The Original Pancake House',

  // Cheesecake Factory variations
  'the cheesecake factory': 'cheesecake factory',
  'cheesecake factory': 'cheesecake factory',

  // CoreLife Eatery variations
  'core life eatery': 'corelife eatery',
  'corelife eatery': 'corelife eatery',
  'corelife': 'corelife eatery',

  // Tous Les Jours variations
  'tous les jours': 'tous les jours',
  'touslesjours': 'tous les jours',
  'tous_les_jours': 'tous les jours',

  // Crisp & Green variations
  'crisp & green': 'crisp and green',
  'crisp and green': 'crisp and green',

  // Duffy\'s Sports Grill variations
  'duffy\'s sports grill': 'duffys',
  'duffys sports grill': 'duffys',
  'duffy\'s': 'duffys',
  'duffys': 'duffys',

  // Famous Dave\'s variations
  'famous dave\'s': 'famous daves',
  'famous daves': 'famous daves',
  'famous dave\'s bar-b-que': 'famous daves',

  // First Watch variations
  'first watch': 'first watch',
  'first watch restaurant': 'first watch',

  // Fresh & Co variations
  'fresh & co': 'fresh and co',
  'fresh and co': 'fresh and co',
  'fresh&co': 'fresh and co',

  // Gregory\'s Coffee variations
  'gregory\'s coffee': 'gregorys coffee',
  'gregorys coffee': 'gregorys coffee',
  'gregory\'s': 'gregorys coffee',

  // Huey Magoo\'s variations
  'magoo\'s chicken & tenders': 'huey magoos',
  'magoo\'s chicken and tenders': 'huey magoos',
  'magoos chicken and tenders': 'huey magoos',
  'magoos_chicken_and_tenders': 'huey magoos',
  'huey magoo\'s chicken tenders': 'huey magoos',
  'huey magoos chicken tenders': 'huey magoos',
  'huey magoo\'s': 'huey magoos',
  'huey magoos': 'huey magoos',

  // Jamba Juice variations
  'jamba juice': 'jamba',
  'jamba': 'jamba',

  // Juice Press variations
  'juice press': 'juice press',

  // Little Beet variations
  'the little beet': 'little beet',
  'little beet': 'little beet',
  'little beet table': 'little beet',

  // LongHorn Steakhouse variations
  'longhorn steakhouse': 'longhorn steakhouse',
  'longhornsteakhouse': 'longhorn steakhouse',

  // Margaritaville variations
  'jimmy buffett\'s margaritaville orlando': 'margaritaville',
  'jimmy buffetts margaritaville orlando': 'margaritaville',
  'margaritaville': 'margaritaville',
  'margaritaville restaurant': 'margaritaville',

  // Miller\'s Ale House variations
  'miller\'s ale house': 'millers ale house',
  'millers ale house': 'millers ale house',
  'miller\'s': 'millers ale house',

  // Native Grill & Wings variations
  'native grill & wings': 'native grill and wings',
  'native grill and wings': 'native grill and wings',
  'native grill': 'native grill and wings',

  // Nekter Juice Bar variations
  'nekter juice bar': 'nektar juice bar',
  'nekter': 'nektar juice bar',
  'nektar juice bar': 'nektar juice bar',
  'nektar': 'nektar juice bar',

  // North Italia variations
  'north italia': 'north Italia',
  'northitalia': 'north Italia',

  // Olive Garden variations
  'olive garden': 'olive garden',
  'olive garden italian restaurant': 'olive garden',

  // Original Chop Shop variations
  'original chop shop': 'original chop shop',
  'the original chop shop': 'original chop shop',

  // PF Chang\'s variations
  'p.f. chang\'s': 'pf changs',
  'pf chang\'s': 'pf changs',
  'pf changs': 'pf changs',
  'p.f. changs': 'pf changs',

  // Pita Pit variations
  'pita pit': 'pita pit',

  // Postino variations
  'postino': 'postino',
  'postino wine cafe': 'postino',

  // Protein Bar & Kitchen variations
  'protein bar & kitchen': 'protein bar and kitchen',
  'protein bar and kitchen': 'protein bar and kitchen',
  'protein bar': 'protein bar and kitchen',

  // Protein House variations
  'protein house': 'protein house',
  'proteinhouse': 'protein house',

  // Pura Vida variations
  'pura vida miami (south florida)': 'pura vida',
  'pura vida miami south florida': 'pura vida',
  'pura vida': 'pura vida',
  'pura vida restaurants': 'pura vida',

  // Red Lobster variations
  'red lobster': 'red lobster',

  // Seasons 52 variations
  'seasons 52': 'seasons 52',

  // Tender Greens variations
  'tender greens': 'tender greens',

  // The Capital Grille variations
  'the capital grille': 'the capital grille',
  'capital grille': 'the capital grille',

  // The Stand variations
  'the stand': 'the stand',
  'the stand restaurant': 'the stand',

  // Urban Plates variations
  'urban plates': 'urban plates',

  // Yard House variations
  'yard house': 'yard house',
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


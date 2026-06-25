// utils/cuisineMap.ts



export const CUISINES = {

  Mexican: ['Chipotle', 'Taco Bell', 'QDOBA', 'Moe\'s Southwest Grill', 'Rubio\'s Coastal Grill', 'El Pollo Loco'],

  Burgers: ['McDonald\'s', 'Wendy\'s', 'Burger King', 'Five Guys', 'Shake Shack', 'In-N-Out Burger', 'Smashburger', 'Culver\'s', 'The Habit Burger Grill', 'Whataburger'],

  Chicken: ['Chick-fil-A', 'Raising Cane\'s', 'Popeyes', 'KFC', 'Zaxby\'s', 'Wingstop', 'Pollo Tropical', 'Chicken Kitchen'],

  Bowls: ['Sweetgreen', 'CAVA', 'Chopt', 'Just Salad', 'Bolay', 'Fresh Kitchen', 'Dig', 'Fit Foodz Cafe'],

  Asian: ['Panda Express', 'Pei Wei', 'Teriyaki Madness'],

  Sandwiches: ['Subway', 'Jersey Mike\'s', 'Jimmy John\'s', 'Firehouse Subs', 'Panera Bread'],

  Breakfast: ['Starbucks', 'Dunkin\'', 'First Watch', 'Einstein Bros Bagels'],

  Pizza: ['Domino\'s'] // You have wings here mostly

};



export const getRestaurantsByCuisine = (cuisine: string) => {

  return CUISINES[cuisine as keyof typeof CUISINES] || [];

};



export const DISH_TAXONOMY: Record<string, { keywords: string[] }> = {
    mexican: {
        keywords: [
            "taco", "tacos", "burrito", "burritos", "quesadilla", "bowl", "nachos", "salsa",
            "guacamole", "enchilada", "fajita", "tostada", "carnitas", "barbacoa"
        ]
    },
    burgers: {
        keywords: [
            "burger", "burgers", "cheeseburger", "hamburger", "patty", "bun", "whopper", "big mac"
        ]
    },
    pizza: {
        keywords: [
            "pizza", "pizzas", "slice", "pepperoni", "cheese", "crust", "pie"
        ]
    },
    asian: {
        keywords: [
            "sushi", "roll", "rolls", "sashimi", "teriyaki", "tempura", "curry",
            "noodle", "noodles", "ramen", "pho", "pad thai", "fried rice", "dumpling", "bao"
        ]
    },
    bowls: {
        keywords: [
            "bowl", "bowls", "greens", "grain"
        ]
    },
    sandwiches: {
        keywords: [
            "sandwich", "sandwiches", "sandwhich", "sandwiche", "sandwhiches", "sub", "subs",
            "hoagie", "hoagies", "hero", "heroes", "wrap", "wraps", "panini", "melt"
        ]
    },
    chicken: {
        keywords: [
            "chicken", "tender", "nugget", "wing", "wings", "breast", "thigh", "fried chicken", "poultry", "drumstick"
        ]
    },
    breakfast: {
        keywords: [
            "breakfast", "pancake", "pancakes", "waffle", "waffles", "omelet", "omelette",
            "egg", "eggs", "bacon", "sausage", "toast", "bagel", "coffee", "latte"
        ]
    },
    wraps: {
        keywords: ['wrap', 'wraps']
    },
    salads: {
        keywords: ['salad', 'salads']
    }
};

export const GENERIC_FOOD_TERMS = [
    "meal", "food", "lunch", "dinner", "breakfast", "snack", "drink", "beverage",
    "appetizer", "dessert", "entree", "main", "side", "dish", "plate", "platter"
];

export const DIETARY_TERMS = [
    "keto", "vegan", "vegetarian", "paleo", "gluten free", "gluten-free",
    "dairy free", "dairy-free", "nut free", "nut-free", "halal", "kosher"
];

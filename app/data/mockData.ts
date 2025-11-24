import { Meal } from '../types';

export const mockMeals: Meal[] = [
  {
    id: "1",
    name: "Grilled Salmon Bowl",
    restaurant: "Fresh Kitchen",
    calories: 550,
    protein: 45,
    carbs: 30,
    fats: 20,
    price: 18,
    prepTime: 15,
    distance: 2.5, // Number, no quotes!
    category: 'restaurant',
    image: "https://images.unsplash.com/photo-1467003909585-2f8a7270028d?w=500&auto=format&fit=crop&q=60",
    description: "Fresh Atlantic salmon with quinoa.",
    ingredients: ["Salmon", "Quinoa", "Kale"]
  },
  {
    id: "2",
    name: "Keto Burger (No Bun)",
    restaurant: "Burger Joint",
    calories: 620,
    protein: 38,
    carbs: 8,
    fats: 45,
    price: 14,
    prepTime: 10,
    distance: 1.2, // Number
    category: 'restaurant',
    image: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=60",
    description: "Double patty burger wrapped in lettuce."
  },
  {
    id: "3",
    name: "Vegan Power Salad",
    restaurant: "Green Eats",
    calories: 420,
    protein: 18,
    carbs: 45,
    fats: 15,
    price: 12,
    prepTime: 5,
    distance: 0.8, // Number
    category: 'restaurant',
    image: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=500&auto=format&fit=crop&q=60",
    description: "Kale, chickpeas, and tahini dressing."
  }
];
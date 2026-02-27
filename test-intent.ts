import { detectExplicitRestaurantConstraint } from './lib/intent-detection';
const queries = [
    "show me lunch at olive garden",
    "Best high-protein option at Burger King",
    "Low calorie meal at a steakhouse.",
    "Healthy airport meal."
];
for(const q of queries) console.log(q, '=>', detectExplicitRestaurantConstraint(q));

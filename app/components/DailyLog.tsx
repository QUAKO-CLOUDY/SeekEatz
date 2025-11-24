export type LoggedMeal = {
  id: string;
  meal: any;
  timestamp: Date;
  date: string;
};

// We add ': any' here so it accepts the props from page.tsx
export function DailyLog({ userProfile, loggedMeals, onRemoveMeal }: any) {
  return <div className="p-10 text-white">Daily Log Screen</div>;
}
import type { Meal, UserProfile } from '../types';

export type LoggedMeal = {
  id: string;
  meal: Meal;
  timestamp: Date;
  date: string;
};

type DailyLogProps = {
  userProfile?: UserProfile;
  loggedMeals?: LoggedMeal[];
  onRemoveMeal?: (mealId: string) => void;
};

export function DailyLog(_props: DailyLogProps) {
  return <div className="p-10 text-white">Daily Log Screen</div>;
}

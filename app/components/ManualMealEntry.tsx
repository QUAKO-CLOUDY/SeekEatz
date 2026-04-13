"use client";

import { useState } from "react";
import { X, Check } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import type { Meal } from "../types";

type Props = {
  onAddMeal: (meal: Meal) => void;
  onClose: () => void;
  /** When provided, form is in edit mode and onUpdateMeal is called on submit */
  editLogId?: string;
  initialMeal?: Meal;
  onUpdateMeal?: (logId: string, meal: Meal) => void;
};

function getInitialFieldValue(value?: string | number | null): string {
  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
}

export function ManualMealEntry({ onAddMeal, onClose, editLogId, initialMeal, onUpdateMeal }: Props) {
  const [mealName, setMealName] = useState(() => getInitialFieldValue(initialMeal?.name));
  const [calories, setCalories] = useState(() => getInitialFieldValue(initialMeal?.calories));
  const [protein, setProtein] = useState(() => getInitialFieldValue(initialMeal?.protein));
  const [carbs, setCarbs] = useState(() => getInitialFieldValue(initialMeal?.carbs));
  const [fats, setFats] = useState(() => getInitialFieldValue(initialMeal?.fats));

  const isEdit = Boolean(editLogId && initialMeal && onUpdateMeal);

  const handleSubmit = () => {
    if (!mealName || !calories || !protein || !carbs || !fats) return;

    const meal: Meal = {
      id: initialMeal?.id ?? `manual-${Date.now()}`,
      name: mealName,
      restaurant: initialMeal?.restaurant ?? "Manual Entry",
      rating: initialMeal?.rating ?? 0,
      category: "restaurant",
      image: initialMeal?.image ?? "/logos/default.png",
      calories: parseInt(calories, 10) || 0,
      protein: parseInt(protein, 10) || 0,
      carbs: parseInt(carbs, 10) || 0,
      fats: parseInt(fats, 10) || 0,
    };

    if (isEdit && editLogId && onUpdateMeal) {
      onUpdateMeal(editLogId, meal);
    } else {
      onAddMeal(meal);
    }
    onClose();
  };

  const isValid = mealName && calories && protein && carbs && fats;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end justify-center">
      <div className="w-full max-w-md bg-gradient-to-br from-gray-900 to-gray-800 border-t border-gray-700 rounded-t-3xl p-6 animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white">{isEdit ? "Edit meal" : "Add meal manually"}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-white/10 rounded-full"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="meal-name" className="text-white mb-2 block">
              Meal Name
            </Label>
            <Input
              id="meal-name"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              placeholder="e.g., Grilled Chicken Salad"
              className="h-12 rounded-xl bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>

          <div>
            <Label htmlFor="calories" className="text-white mb-2 block">
              Calories
            </Label>
            <Input
              id="calories"
              type="number"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              placeholder="500"
              className="h-12 rounded-xl bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="protein" className="text-white mb-2 block">
                Protein (g)
              </Label>
              <Input
                id="protein"
                type="number"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="30"
                className="h-12 rounded-xl bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            <div>
              <Label htmlFor="carbs" className="text-white mb-2 block">
                Carbs (g)
              </Label>
              <Input
                id="carbs"
                type="number"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                placeholder="40"
                className="h-12 rounded-xl bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>

            <div>
              <Label htmlFor="fats" className="text-white mb-2 block">
                Fats (g)
              </Label>
              <Input
                id="fats"
                type="number"
                value={fats}
                onChange={(e) => setFats(e.target.value)}
                placeholder="15"
                className="h-12 rounded-xl bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 h-12 rounded-full bg-gray-800 border-gray-700 text-white hover:bg-gray-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!isValid}
            className="flex-1 h-12 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 shadow-lg shadow-cyan-500/30 disabled:opacity-50 disabled:shadow-none"
          >
            <Check className="mr-2 w-5 h-5" />
            {isEdit ? "Save changes" : "Add meal"}
          </Button>
        </div>
      </div>
    </div>
  );
}

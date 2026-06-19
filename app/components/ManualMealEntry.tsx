"use client";

import { useState } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import type { Meal } from "../types";
import {
  buildManualMealFromForm,
  canSubmitManualMeal,
  getManualLogButtonClassName,
} from "@/lib/manual-meal-utils";

type Props = {
  onAddMeal: (meal: Meal) => void;
  onClose: () => void;
  /** When provided, form is in edit mode and onUpdateMeal is called on submit */
  editLogId?: string;
  initialMeal?: Meal;
  onUpdateMeal?: (logId: string, meal: Meal) => void;
};

const inputClassName =
  "h-12 rounded-xl bg-muted/50 border border-sky-200/70 text-foreground placeholder:text-muted-foreground focus-visible:border-sky-400 focus-visible:ring-sky-400/25 dark:border-sky-500/20 dark:bg-muted/40";

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
    const values = { name: mealName, calories, protein, carbs, fats };
    if (!canSubmitManualMeal(values)) return;

    const meal = buildManualMealFromForm(values, {
      id: initialMeal?.id,
      restaurant: initialMeal?.restaurant,
      image: initialMeal?.image,
      rating: initialMeal?.rating,
    });

    if (isEdit && editLogId && onUpdateMeal) {
      onUpdateMeal(editLogId, meal);
    } else {
      onAddMeal(meal);
    }
    onClose();
  };

  const isValid = canSubmitManualMeal({ name: mealName, calories, protein, carbs, fats });

  return (
    <div className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-end justify-center">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-gradient-to-br from-card via-card to-sky-50/40 border-t border-sky-200/60 rounded-t-3xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up dark:from-card dark:via-card dark:to-sky-950/20 dark:border-sky-500/15">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-600/80 dark:text-sky-300/80">
              Manual entry
            </p>
            <h2 className="text-card-foreground font-semibold">
              {isEdit ? "Edit meal" : "Add meal manually"}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-sky-100/60 dark:hover:bg-sky-500/10 rounded-full"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Form */}
        <div className="space-y-4">
          <div>
            <Label htmlFor="meal-name" className="text-foreground/80 mb-2 block text-xs ml-1">
              Meal Name
            </Label>
            <Input
              id="meal-name"
              value={mealName}
              onChange={(e) => setMealName(e.target.value)}
              placeholder="e.g., Grilled Chicken Salad"
              className={inputClassName}
            />
          </div>

          <div>
            <Label htmlFor="calories" className="text-foreground/80 mb-2 block text-xs ml-1">
              Calories
            </Label>
            <Input
              id="calories"
              type="number"
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              placeholder="500"
              className={inputClassName}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="protein" className="text-foreground/80 mb-2 block text-xs ml-1">
                Protein (g)
              </Label>
              <Input
                id="protein"
                type="number"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder="30"
                className={inputClassName}
              />
            </div>

            <div>
              <Label htmlFor="carbs" className="text-foreground/80 mb-2 block text-xs ml-1">
                Carbs (g)
              </Label>
              <Input
                id="carbs"
                type="number"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
                placeholder="40"
                className={inputClassName}
              />
            </div>

            <div>
              <Label htmlFor="fats" className="text-foreground/80 mb-2 block text-xs ml-1">
                Fats (g)
              </Label>
              <Input
                id="fats"
                type="number"
                value={fats}
                onChange={(e) => setFats(e.target.value)}
                placeholder="15"
                className={inputClassName}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-full bg-muted/50 border border-border text-foreground font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid}
            className={getManualLogButtonClassName(isValid)}
          >
            {isEdit ? (
              "Save changes"
            ) : (
              <>
                <Plus className="w-5 h-5 shrink-0" />
                Log meal
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

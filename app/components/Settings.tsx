"use client";

import { useState } from 'react';
import { User, CreditCard, HelpCircle, LogOut, ChevronRight, Edit, Sun, Moon, Smartphone } from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { useTheme } from '../contexts/ThemeContext';
import type { UserProfile } from '../types'; // <--- Importing from the central types file

type Props = {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
};

export function Settings({ userProfile, onUpdateProfile }: Props) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  
  // Mock notification states
  const [pushNotifications, setPushNotifications] = useState(true);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [mealReminders, setMealReminders] = useState(true);

  const [editedProfile, setEditedProfile] = useState(userProfile);

  const handleSaveProfile = () => {
    onUpdateProfile(editedProfile);
    setIsEditingProfile(false);
  };

  const goalLabels: Record<string, string> = {
    'lose-fat': 'Lose Fat',
    'maintain': 'Maintain',
    'build-muscle': 'Build Muscle',
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background h-full">
      {/* Header */}
      <div className="bg-gradient-to-br from-muted/50 via-muted/30 to-background p-6 border-b">
        <div className="flex items-center gap-3">
          <div className="size-12 bg-gradient-to-br from-gray-600 to-gray-700 rounded-2xl flex items-center justify-center shadow-lg">
            <User className="size-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Settings</h1>
            <p className="text-muted-foreground">Manage your preferences</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-background">
        {/* Profile Section */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Profile</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditingProfile(!isEditingProfile)}
              className="rounded-full text-cyan-500 hover:text-cyan-600 hover:bg-cyan-500/10"
            >
              <Edit className="size-4 mr-2" />
              {isEditingProfile ? 'Cancel' : 'Edit'}
            </Button>
          </div>

          {!isEditingProfile ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-muted-foreground">Goal</span>
                <Badge variant="outline" className="bg-cyan-500/10 text-cyan-600 border-cyan-500/20">
                  {goalLabels[userProfile.goal] || userProfile.goal}
                </Badge>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-muted-foreground">Diet Type</span>
                <span className="text-foreground font-medium">{userProfile.dietaryType}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-muted-foreground">Daily Calories</span>
                <span className="text-foreground font-medium">{userProfile.calorieTarget} cal</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-muted-foreground">Protein Target</span>
                <span className="text-foreground font-medium">{userProfile.proteinTarget}g</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b">
                <span className="text-muted-foreground">Carbs Target</span>
                <span className="text-foreground font-medium">{userProfile.carbsTarget}g</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-muted-foreground">Fats Target</span>
                <span className="text-foreground font-medium">{userProfile.fatsTarget}g</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="calories" className="mb-2 block">Daily Calories</Label>
                <Input
                  id="calories"
                  type="number"
                  value={editedProfile.calorieTarget}
                  onChange={(e) => setEditedProfile({ ...editedProfile, calorieTarget: parseInt(e.target.value) || 0 })}
                  className="bg-muted/50"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label htmlFor="protein" className="mb-2 block">Pro (g)</Label>
                  <Input
                    id="protein"
                    type="number"
                    value={editedProfile.proteinTarget}
                    onChange={(e) => setEditedProfile({ ...editedProfile, proteinTarget: parseInt(e.target.value) || 0 })}
                    className="bg-muted/50"
                  />
                </div>
                <div>
                  <Label htmlFor="carbs" className="mb-2 block">Carbs (g)</Label>
                  <Input
                    id="carbs"
                    type="number"
                    value={editedProfile.carbsTarget}
                    onChange={(e) => setEditedProfile({ ...editedProfile, carbsTarget: parseInt(e.target.value) || 0 })}
                    className="bg-muted/50"
                  />
                </div>
                <div>
                  <Label htmlFor="fats" className="mb-2 block">Fats (g)</Label>
                  <Input
                    id="fats"
                    type="number"
                    value={editedProfile.fatsTarget}
                    onChange={(e) => setEditedProfile({ ...editedProfile, fatsTarget: parseInt(e.target.value) || 0 })}
                    className="bg-muted/50"
                  />
                </div>
              </div>
              <Button
                onClick={handleSaveProfile}
                className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white"
              >
                Save Changes
              </Button>
            </div>
          )}
        </div>

        {/* Theme Section */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Appearance</h2>
          <Label className="mb-3 block text-muted-foreground">Theme</Label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setTheme('light')}
              className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                theme === 'light'
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-border bg-muted/50 hover:bg-muted'
              }`}
            >
              <Sun className={`size-5 ${theme === 'light' ? 'text-cyan-500' : 'text-muted-foreground'}`} />
              <p className={`text-sm font-medium ${theme === 'light' ? 'text-cyan-600' : 'text-muted-foreground'}`}>Light</p>
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                theme === 'dark'
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-border bg-muted/50 hover:bg-muted'
              }`}
            >
              <Moon className={`size-5 ${theme === 'dark' ? 'text-cyan-500' : 'text-muted-foreground'}`} />
              <p className={`text-sm font-medium ${theme === 'dark' ? 'text-cyan-600' : 'text-muted-foreground'}`}>Dark</p>
            </button>
            <button
              onClick={() => setTheme('auto')}
              className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                theme === 'auto'
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-border bg-muted/50 hover:bg-muted'
              }`}
            >
              <Smartphone className={`size-5 ${theme === 'auto' ? 'text-cyan-500' : 'text-muted-foreground'}`} />
              <p className={`text-sm font-medium ${theme === 'auto' ? 'text-cyan-600' : 'text-muted-foreground'}`}>Auto</p>
            </button>
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Notifications</h2>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="push" className="text-foreground">Push Notifications</Label>
                <p className="text-sm text-muted-foreground">Get notified about your meal tracking</p>
              </div>
              <Switch
                id="push"
                checked={pushNotifications}
                onCheckedChange={setPushNotifications}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="email" className="text-foreground">Email Notifications</Label>
                <p className="text-sm text-muted-foreground">Weekly progress reports</p>
              </div>
              <Switch
                id="email"
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="reminders" className="text-foreground">Meal Reminders</Label>
                <p className="text-sm text-muted-foreground">Remind me to log my meals</p>
              </div>
              <Switch
                id="reminders"
                checked={mealReminders}
                onCheckedChange={setMealReminders}
              />
            </div>
          </div>
        </div>

        {/* Other Options */}
        <div className="space-y-2">
          <button className="w-full flex items-center justify-between p-4 bg-card border rounded-2xl hover:border-cyan-500/50 transition-all group">
            <div className="flex items-center gap-3">
              <CreditCard className="size-5 text-muted-foreground group-hover:text-cyan-500 transition-colors" />
              <span className="text-foreground">Subscription</span>
            </div>
            <ChevronRight className="size-5 text-muted-foreground" />
          </button>
          
          <button className="w-full flex items-center justify-between p-4 bg-card border rounded-2xl hover:border-cyan-500/50 transition-all group">
            <div className="flex items-center gap-3">
              <HelpCircle className="size-5 text-muted-foreground group-hover:text-cyan-500 transition-colors" />
              <span className="text-foreground">Help & Support</span>
            </div>
            <ChevronRight className="size-5 text-muted-foreground" />
          </button>
          
          <button className="w-full flex items-center justify-between p-4 bg-red-500/5 border border-red-500/20 rounded-2xl hover:bg-red-500/10 transition-all group">
            <div className="flex items-center gap-3">
              <LogOut className="size-5 text-red-500" />
              <span className="text-red-500 font-medium">Log Out</span>
            </div>
            <ChevronRight className="size-5 text-red-500/50" />
          </button>
        </div>
      </div>
    </div>
  );
}
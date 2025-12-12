"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  User, 
  CreditCard, 
  HelpCircle, 
  LogOut, 
  ChevronRight, 
  Edit, 
  Sun, 
  Moon, 
  FileText,
  Shield,
  MessageCircle,
  TrendingDown,
  Dumbbell,
  Scale
} from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { useTheme } from '../contexts/ThemeContext';
import { createClient } from '@/utils/supabase/client';
import type { UserProfile } from '../types';

type Props = {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
};

// Helper to generate initials from name
const getInitials = (name?: string): string => {
  if (!name) return 'U';
  return name
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0]?.toUpperCase())
    .slice(0, 2)
    .join('');
};

export function Settings({ userProfile, onUpdateProfile }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const { theme, setTheme, resolvedTheme } = useTheme();
  
  // User data state
  const [userEmail, setUserEmail] = useState<string>('');
  const [userFullName, setUserFullName] = useState<string>('');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  
  // Profile editing - removed inline editing, Edit button navigates to account details
  
  // Notification preferences - local-only for now
  const [mealSuggestions, setMealSuggestions] = useState(false);
  const [dailySummary, setDailySummary] = useState(false);
  const [progressReminders, setProgressReminders] = useState(false);

  // Migrate 'auto' theme to 'dark' on mount
  useEffect(() => {
    const currentTheme = localStorage.getItem('seekeatz-theme');
    if (currentTheme === 'auto') {
      // Migrate to dark theme (or could use resolvedTheme)
      const resolved = resolvedTheme || 'dark';
      setTheme(resolved);
      localStorage.setItem('seekeatz-theme', resolved);
    }
  }, []);

  // Load user profile data from Supabase on mount
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          setUserEmail(user.email || '');
          
          // Load profile from Supabase profiles table
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('user_profile, email, full_name')
            .eq('id', user.id)
            .single();
          
          if (!error && profile) {
            // Extract name from user_profile or full_name column
            const profileData = profile.user_profile || {};
            const fullName = profile.full_name || profileData.name || user.email?.split('@')[0] || '';
            setUserFullName(fullName);
            
            // Update userProfile with data from Supabase if available (including goal)
            if (profile.user_profile) {
              const supabaseProfile = profile.user_profile as Partial<UserProfile>;
              if (supabaseProfile.goal || supabaseProfile.calorieTarget) {
                onUpdateProfile({ ...userProfile, ...supabaseProfile } as UserProfile);
              }
            }
          } else {
            // Fallback to email username
            setUserFullName(user.email?.split('@')[0] || 'User');
          }
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        setUserEmail('user@example.com');
        setUserFullName('User');
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadUserData();
  }, [supabase]);

  // Handle goal change - update Supabase
  const handleGoalChange = async (goalId: 'lose-fat' | 'maintain' | 'build-muscle') => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const updatedProfile = { ...userProfile, goal: goalId };
      
      // Update local state immediately for instant feedback
      onUpdateProfile(updatedProfile);

      // Update in Supabase
      const { error } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          user_profile: updatedProfile,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        });

      if (error) {
        console.error('Error updating goal:', error);
        // Revert on error
        onUpdateProfile(userProfile);
      } else {
        // Also update localStorage
        localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
      }
    } catch (error) {
      console.error('Error saving goal:', error);
      // Revert on error
      onUpdateProfile(userProfile);
    }
  };

  // Handle theme change - save to Supabase and localStorage
  const handleThemeChange = async (newTheme: 'light' | 'dark') => {
    try {
      // Update theme immediately
      setTheme(newTheme);
      
      // Save to localStorage (ThemeContext already does this, but ensure it's saved)
      localStorage.setItem('seekeatz-theme', newTheme);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Save theme preference to Supabase (non-blocking)
        supabase
          .from('profiles')
          .upsert({
            id: user.id,
            theme_preference: newTheme,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'id',
          })
          .catch((error) => {
            console.error('Error saving theme to Supabase:', error);
          });
      }
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  // Handle notification toggle - local-only for now
  const handleNotificationChange = (
    key: 'mealSuggestions' | 'dailySummary' | 'progressReminders',
    value: boolean
  ) => {
    // Only update local state - no Supabase calls
    if (key === 'mealSuggestions') setMealSuggestions(value);
    if (key === 'dailySummary') setDailySummary(value);
    if (key === 'progressReminders') setProgressReminders(value);
  };


  // Handle logout
  const handleLogout = async () => {
    if (confirm('Are you sure you want to log out?')) {
      try {
        await supabase.auth.signOut();
        // Redirect to sign-in page after successful logout
        router.replace('/auth/signin');
      } catch (error) {
        console.error('Error signing out:', error);
        // Still redirect even if signOut fails
        router.replace('/auth/signin');
      }
    }
  };

  const goalLabels: Record<string, string> = {
    'lose-fat': 'Lose Fat',
    'maintain': 'Maintain',
    'build-muscle': 'Build Muscle',
  };

  const goalOptions = [
    { id: 'lose-fat' as const, label: 'Lose Fat', icon: TrendingDown },
    { id: 'maintain' as const, label: 'Maintain', icon: Scale },
    { id: 'build-muscle' as const, label: 'Build Muscle', icon: Dumbbell },
  ];

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
        {/* Profile & Goals Section */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Profile & Goals</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/settings/account')}
              className="rounded-full text-cyan-500 hover:text-cyan-600 hover:bg-cyan-500/10"
            >
              <Edit className="size-4 mr-2" />
              Edit
            </Button>
          </div>

          {/* Avatar and Name/Email */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b">
            <div className="size-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-lg">
              {getInitials(userFullName || userProfile.name)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-lg font-semibold text-foreground truncate">
                {userFullName || userProfile.name || 'User'}
              </h3>
              <p className="text-sm text-muted-foreground truncate">
                {userEmail || 'user@example.com'}
              </p>
            </div>
          </div>

          {/* Goal Badge */}
          <div className="mb-6">
            <Label className="text-sm text-muted-foreground mb-3 block">Current Goal</Label>
            <Badge variant="outline" className="bg-cyan-500/10 text-cyan-600 border-cyan-500/20 px-4 py-2 text-base">
              {goalLabels[userProfile.goal] || userProfile.goal}
            </Badge>
          </div>

          {/* Goal Selector Buttons */}
          <div className="mb-6">
            <Label className="text-sm text-muted-foreground mb-3 block">Select Your Goal</Label>
            <div className="grid grid-cols-3 gap-3">
              {goalOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = userProfile.goal === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => handleGoalChange(option.id)}
                    className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-border bg-muted/50 hover:bg-muted'
                    }`}
                  >
                    <Icon className={`size-5 ${isSelected ? 'text-cyan-500' : 'text-muted-foreground'}`} />
                    <p className={`text-sm font-medium ${isSelected ? 'text-cyan-600' : 'text-muted-foreground'}`}>
                      {option.label}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Macro Targets */}
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-3 border-b">
              <span className="text-muted-foreground">Diet Type</span>
              <span className="text-foreground font-medium">{userProfile.dietaryType || 'None'}</span>
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
        </div>

        {/* Appearance Section */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Appearance</h2>
          <Label className="mb-3 block text-muted-foreground">Theme</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleThemeChange('light')}
              className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                (theme === 'light' || resolvedTheme === 'light')
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-border bg-muted/50 hover:bg-muted'
              }`}
            >
              <Sun className={`size-5 ${(theme === 'light' || resolvedTheme === 'light') ? 'text-cyan-500' : 'text-muted-foreground'}`} />
              <p className={`text-sm font-medium ${(theme === 'light' || resolvedTheme === 'light') ? 'text-cyan-600' : 'text-muted-foreground'}`}>Light</p>
            </button>
            <button
              onClick={() => handleThemeChange('dark')}
              className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                (theme === 'dark' || resolvedTheme === 'dark')
                  ? 'border-cyan-500 bg-cyan-500/10'
                  : 'border-border bg-muted/50 hover:bg-muted'
              }`}
            >
              <Moon className={`size-5 ${(theme === 'dark' || resolvedTheme === 'dark') ? 'text-cyan-500' : 'text-muted-foreground'}`} />
              <p className={`text-sm font-medium ${(theme === 'dark' || resolvedTheme === 'dark') ? 'text-cyan-600' : 'text-muted-foreground'}`}>Dark</p>
            </button>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Notifications</h2>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="mealSuggestions" className="text-foreground">Meal Suggestions</Label>
                <p className="text-sm text-muted-foreground">Get notified about personalized meal recommendations</p>
              </div>
              <Switch
                id="mealSuggestions"
                checked={mealSuggestions}
                onCheckedChange={(checked) => handleNotificationChange('mealSuggestions', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="dailySummary" className="text-foreground">Daily Summary</Label>
                <p className="text-sm text-muted-foreground">Receive a daily summary of your progress</p>
              </div>
              <Switch
                id="dailySummary"
                checked={dailySummary}
                onCheckedChange={(checked) => handleNotificationChange('dailySummary', checked)}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="progressReminders" className="text-foreground">Progress Reminders</Label>
                <p className="text-sm text-muted-foreground">Remind me to log my meals</p>
              </div>
              <Switch
                id="progressReminders"
                checked={progressReminders}
                onCheckedChange={(checked) => handleNotificationChange('progressReminders', checked)}
              />
            </div>
          </div>
        </div>

        {/* Subscription Section */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Subscription</h2>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-foreground font-medium">Plan: Free</p>
              <p className="text-sm text-muted-foreground">Upgrade to unlock premium features</p>
            </div>
          </div>
          <Button
            onClick={() => router.push('/settings/subscription')}
            className="w-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white"
          >
            Manage Subscription
          </Button>
        </div>

        {/* Help & Support Section */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Help & Support</h2>
          <div className="space-y-2">
            <button
              onClick={() => router.push('/help/faq')}
              className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted rounded-2xl transition-all group"
            >
              <div className="flex items-center gap-3">
                <HelpCircle className="size-5 text-muted-foreground group-hover:text-cyan-500 transition-colors" />
                <span className="text-foreground">FAQ</span>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" />
            </button>
            
            <button
              onClick={() => router.push('/help/contact')}
              className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted rounded-2xl transition-all group"
            >
              <div className="flex items-center gap-3">
                <MessageCircle className="size-5 text-muted-foreground group-hover:text-cyan-500 transition-colors" />
                <span className="text-foreground">Contact Support</span>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" />
            </button>
            
            <button
              onClick={() => router.push('/legal/terms')}
              className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted rounded-2xl transition-all group"
            >
              <div className="flex items-center gap-3">
                <FileText className="size-5 text-muted-foreground group-hover:text-cyan-500 transition-colors" />
                <span className="text-foreground">Terms of Service</span>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" />
            </button>
            
            <button
              onClick={() => router.push('/legal/privacy')}
              className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted rounded-2xl transition-all group"
            >
              <div className="flex items-center gap-3">
                <Shield className="size-5 text-muted-foreground group-hover:text-cyan-500 transition-colors" />
                <span className="text-foreground">Privacy Policy</span>
              </div>
              <ChevronRight className="size-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Account Section */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-foreground mb-4">Account</h2>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-2xl hover:bg-red-500/10 hover:border-red-500/30 transition-all"
          >
            <LogOut className="size-5 text-red-500" />
            <span className="text-red-500 font-medium">Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
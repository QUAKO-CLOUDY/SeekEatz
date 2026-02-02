"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { createClient } from '@/utils/supabase/client';
import type { UserProfile } from '@/app/types';

const DIET_TYPES = [
  'None',
  'Balanced',
  'Vegetarian',
  'Vegan',
  'Keto',
  'Paleo',
  'Low-Carb',
  'High-Protein',
  'Mediterranean',
  'Pescatarian',
];

export default function AccountEditPage() {
  const router = useRouter();
  const supabase = createClient();
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  
  const [profile, setProfile] = useState<UserProfile>({
    goal: 'maintain',
    diet_type: 'None',
    dietary_options: [],
    target_calories: 2200,
    target_protein_g: 150,
    target_carbs_g: 200,
    target_fats_g: 70,
  });

  // Load user profile from Supabase and localStorage
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          router.push('/auth/signin');
          return;
        }

        // Try to load from Supabase first
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('user_profile')
          .eq('id', user.id)
          .single();

        if (!profileError && profileData?.user_profile) {
          const supabaseProfile = profileData.user_profile as Partial<UserProfile>;
          setProfile(prev => ({
            ...prev,
            ...supabaseProfile,
          }));
        } else {
          // Fallback to localStorage
          if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('userProfile');
            if (saved) {
              try {
                const parsed = JSON.parse(saved);
                setProfile(prev => ({ ...prev, ...parsed }));
              } catch (e) {
                console.error('Failed to parse userProfile from localStorage:', e);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error loading profile:', err);
        setError('Failed to load profile data');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [supabase, router]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setError('You must be logged in to save changes');
        setIsSaving(false);
        return;
      }

      // Validate inputs
      const cals = profile.target_calories ?? 0;
      const protein = profile.target_protein_g ?? 0;
      const carbs = profile.target_carbs_g ?? 0;
      const fats = profile.target_fats_g ?? 0;

      if (cals < 500 || cals > 5000) {
        setError('Calorie target must be between 500 and 5000');
        setIsSaving(false);
        return;
      }

      if (protein < 0 || protein > 500) {
        setError('Protein target must be between 0 and 500g');
        setIsSaving(false);
        return;
      }

      if (carbs < 0 || carbs > 600) {
        setError('Carbs target must be between 0 and 600g');
        setIsSaving(false);
        return;
      }

      if (fats < 0 || fats > 300) {
        setError('Fats target must be between 0 and 300g');
        setIsSaving(false);
        return;
      }

      // Update Supabase
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          user_profile: profile,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        });

      if (updateError) {
        console.error('Error updating profile:', updateError);
        setError('Failed to save changes. Please try again.');
        setIsSaving(false);
        return;
      }

      // Update localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('userProfile', JSON.stringify(profile));
      }

      setSuccess(true);
      
      // Show success message and redirect after a short delay
      setTimeout(() => {
        router.push('/settings');
      }, 1500);
    } catch (err) {
      console.error('Error saving profile:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading profile...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-to-br from-muted/50 via-muted/30 to-background p-6 border-b sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="rounded-full"
          >
            <ArrowLeft className="size-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Edit Profile</h1>
            <p className="text-sm text-muted-foreground">Update your diet preferences and macro targets</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Success/Error Messages */}
        {success && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-600 rounded-2xl p-4">
            Profile updated successfully! Redirecting...
          </div>
        )}
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-600 rounded-2xl p-4">
            {error}
          </div>
        )}

        {/* Diet Type */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <Label htmlFor="dietType" className="text-base font-semibold mb-4 block">
            Diet Type
          </Label>
          <Select
            value={profile.diet_type ?? 'None'}
            onValueChange={(value) => setProfile(prev => ({ ...prev, diet_type: value }))}
          >
            <SelectTrigger id="dietType" className="h-12">
              <SelectValue placeholder="Select diet type" />
            </SelectTrigger>
            <SelectContent>
              {DIET_TYPES.map((diet) => (
                <SelectItem key={diet} value={diet}>
                  {diet}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Calorie Target */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <Label htmlFor="calories" className="text-base font-semibold mb-4 block">
            Daily Calorie Target
          </Label>
          <Input
            id="calories"
            type="number"
            min="500"
            max="5000"
            step="50"
            value={profile.target_calories ?? ''}
            onChange={(e) => setProfile(prev => ({ 
              ...prev, 
              target_calories: parseInt(e.target.value) || 0 
            }))}
            className="h-12 text-lg"
          />
          <p className="text-sm text-muted-foreground mt-2">
            Recommended range: 1,200 - 3,000 calories per day
          </p>
        </div>

        {/* Macro Targets */}
        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <h2 className="text-base font-semibold mb-4">Macro Targets (grams per day)</h2>
          
          <div className="space-y-4">
            {/* Protein */}
            <div>
              <Label htmlFor="protein" className="text-sm font-medium mb-2 block">
                Protein Target
              </Label>
              <Input
                id="protein"
                type="number"
                min="0"
                max="500"
                step="5"
                value={profile.target_protein_g ?? ''}
                onChange={(e) => setProfile(prev => ({ 
                  ...prev, 
                  target_protein_g: parseInt(e.target.value) || 0 
                }))}
                className="h-12"
              />
            </div>

            {/* Carbs */}
            <div>
              <Label htmlFor="carbs" className="text-sm font-medium mb-2 block">
                Carbs Target
              </Label>
              <Input
                id="carbs"
                type="number"
                min="0"
                max="600"
                step="10"
                value={profile.target_carbs_g ?? ''}
                onChange={(e) => setProfile(prev => ({ 
                  ...prev, 
                  target_carbs_g: parseInt(e.target.value) || 0 
                }))}
                className="h-12"
              />
            </div>

            {/* Fats */}
            <div>
              <Label htmlFor="fats" className="text-sm font-medium mb-2 block">
                Fats Target
              </Label>
              <Input
                id="fats"
                type="number"
                min="0"
                max="300"
                step="5"
                value={profile.target_fats_g ?? ''}
                onChange={(e) => setProfile(prev => ({ 
                  ...prev, 
                  target_fats_g: parseInt(e.target.value) || 0 
                }))}
                className="h-12"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex gap-4 pb-6">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="flex-1 h-12 rounded-full"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 h-12 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="size-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

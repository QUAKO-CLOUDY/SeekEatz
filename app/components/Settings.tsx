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
  Save,
  X,
  ArrowLeft,
} from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { useTheme } from '../contexts/ThemeContext';
import { useChat } from '../contexts/ChatContext';
import { createClient } from '@/utils/supabase/client';
import type { UserProfile } from '../types';
import { requestNotificationPermission, sendMealSuggestionNotification } from '@/utils/notifications';
import cavaData from '@/data/jsons/cava_raw.json';
import { getEntitlementPlanLabel } from '@/lib/entitlements';
import { useAccountEntitlement } from '@/app/hooks/useAccountEntitlement';

type Props = {
  userProfile: UserProfile;
  onUpdateProfile: (profile: UserProfile) => void;
};

type NotificationPreferenceKey = 'mealSuggestions' | 'dailySummary' | 'progressReminders';

type NotificationPreferences = Record<NotificationPreferenceKey, boolean>;

const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  mealSuggestions: false,
  dailySummary: false,
  progressReminders: false,
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
  const { clearChat } = useChat();
  
  // User data state
  const [userEmail, setUserEmail] = useState<string>('');
  const [userFullName, setUserFullName] = useState<string>('');
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const { entitlement, refresh: refreshEntitlement } = useAccountEntitlement(true);

  // Helper function to safely convert number to database value (handles undefined/null/NaN)
  // Returns: valid number or null (never undefined, NaN, or string)
  // This must be defined BEFORE profileToDbColumns which uses it
  const safeNumberForDb = (val: number | undefined | null): number | null => {
    if (val === undefined || val === null) {
      return null;
    }
    // Ensure it's a number type
    const num = typeof val === 'number' ? val : Number(val);
    // Return null if NaN, otherwise return the number
    return isNaN(num) ? null : num;
  };

  // Helper function to convert UserProfile to flat database columns
  const profileToDbColumns = (profile: UserProfile) => {
    // Use the component-level safeNumberForDb helper (defined above)
    const columns: Record<string, unknown> = {
      target_calories: safeNumberForDb(profile.target_calories),
      target_protein_g: safeNumberForDb(profile.target_protein_g),
      target_carbs_g: safeNumberForDb(profile.target_carbs_g),
      target_fats_g: safeNumberForDb(profile.target_fats_g),
      search_distance_miles: safeNumberForDb(profile.search_distance_miles),
    };

    // Add optional fields if they exist
    if (profile.full_name) columns.full_name = profile.full_name;
    // Explicitly set diet_type to null if undefined to clear it from the database
    // Never set a default - only save what the user explicitly chooses
    columns.diet_type = profile.diet_type ?? null;
    if (profile.dietary_options && profile.dietary_options.length > 0) {
      columns.dietary_options = profile.dietary_options;
    } else {
      columns.dietary_options = [];
    }

    return columns;
  };
  
  // Helper function to safely convert number to string (handles undefined/null)
  const safeNumberToString = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return '';
    }
    return value.toString();
  };

  // Helper function to safely convert string to number (handles empty strings)
  const safeStringToNumber = (value: string): number | null => {
    if (value === '' || value.trim() === '') {
      return null;
    }
    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      return null;
    }
    return parsed;
  };

  // Profile editing state
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editedProfile, setEditedProfile] = useState<UserProfile>(userProfile);
  // Store input values as strings to allow empty inputs
  const [inputValues, setInputValues] = useState({
    full_name: userProfile.full_name || '',
    target_calories: safeNumberToString(userProfile.target_calories),
    target_protein_g: safeNumberToString(userProfile.target_protein_g),
    target_carbs_g: safeNumberToString(userProfile.target_carbs_g),
    target_fats_g: safeNumberToString(userProfile.target_fats_g),
  });
  
  // Notification preferences
  const [mealSuggestions, setMealSuggestions] = useState(false);
  const [dailySummary, setDailySummary] = useState(false);
  const [progressReminders, setProgressReminders] = useState(false);

  // Settings subviews
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  const notificationStorageKey = `seekeatz-notification-prefs:${userEmail || 'guest'}`;
  const subscriptionPlanLabel = getEntitlementPlanLabel(entitlement);

  const applyNotificationPreferences = (preferences: NotificationPreferences) => {
    setMealSuggestions(preferences.mealSuggestions);
    setDailySummary(preferences.dailySummary);
    setProgressReminders(preferences.progressReminders);
  };

  // Migrate 'auto' theme to 'light' on mount
  useEffect(() => {
    const currentTheme = localStorage.getItem('seekeatz-theme');
    if (currentTheme === 'auto') {
      // Migrate to light theme (default)
      setTheme('light');
      localStorage.setItem('seekeatz-theme', 'light');
    }
  }, [setTheme]);

  useEffect(() => {
    if (!saveSuccessMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setSaveSuccessMessage(null), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [saveSuccessMessage]);

  // Load user profile data from Supabase on mount and when component becomes visible
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          setUserEmail(user.email || '');
          
          // Load profile from Supabase profiles table (using flat columns)
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();
          
          if (!error && profile) {
            // Extract name from full_name field or user_metadata, fallback to email
            const fullName = profile.full_name || user.user_metadata?.full_name || user.email || '';
            setUserFullName(fullName);
            
            // Load theme preference from Supabase and apply it
            if (profile.theme_preference && (profile.theme_preference === 'light' || profile.theme_preference === 'dark')) {
              setTheme(profile.theme_preference);
              // Also update localStorage to keep them in sync
              localStorage.setItem('seekeatz-theme', profile.theme_preference);
            }
            
            // Convert flat database columns back to UserProfile object
            // Ensure numeric values are numbers or undefined (never null/NaN)
            const safeNumber = (val: unknown): number | undefined => {
              if (val === null || val === undefined) {
                return undefined;
              }
              const num = typeof val === 'number' ? val : Number(val);
              return isNaN(num) ? undefined : num;
            };

            // Default values for new users
            const DEFAULT_CALORIES = 2000;
            const DEFAULT_PROTEIN = 150;
            const DEFAULT_CARBS = 200;
            const DEFAULT_FATS = 70;
            const DEFAULT_SEARCH_DISTANCE = 10;

            const supabaseProfile: Partial<UserProfile> = {
              full_name: profile.full_name || undefined,
              target_calories: safeNumber(profile.target_calories) ?? safeNumber(userProfile.target_calories) ?? DEFAULT_CALORIES,
              target_protein_g: safeNumber(profile.target_protein_g) ?? safeNumber(userProfile.target_protein_g) ?? DEFAULT_PROTEIN,
              target_carbs_g: safeNumber(profile.target_carbs_g) ?? safeNumber(userProfile.target_carbs_g) ?? DEFAULT_CARBS,
              target_fats_g: safeNumber(profile.target_fats_g) ?? safeNumber(userProfile.target_fats_g) ?? DEFAULT_FATS,
              // Never set a default diet_type - only load what's in the database (null/undefined means no diet type selected)
              diet_type: profile.diet_type ? profile.diet_type : undefined,
              dietary_options: profile.dietary_options || [],
              search_distance_miles: safeNumber(profile.search_distance_miles) ?? safeNumber(userProfile.search_distance_miles) ?? DEFAULT_SEARCH_DISTANCE,
            };
            
            // Merge with current userProfile to preserve any local state
            const updatedProfile = { ...userProfile, ...supabaseProfile } as UserProfile;
            
            // If search_distance_miles is not set, default to 10 and save it
            if (!updatedProfile.search_distance_miles) {
              updatedProfile.search_distance_miles = 10;
              // Save the default to the database
              const dbColumns = profileToDbColumns(updatedProfile);
              (async () => {
                try {
                  await supabase
                    .from('profiles')
                    .update({
                      ...dbColumns,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', user.id);
                  // Also update localStorage
                  localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
                } catch (error: unknown) {
                  console.error('Error saving default search distance:', error);
                }
              })();
            }
            
            onUpdateProfile(updatedProfile);
            // Update userFullName if we have full_name in the updated profile
            if (updatedProfile.full_name) {
              setUserFullName(updatedProfile.full_name);
            }
          } else {
            // Fallback to user_metadata or email username
            const fallbackName = user.user_metadata?.full_name || user.email?.split('@')[0] || '';
            setUserFullName(fallbackName);
          }
        }
      } catch (error) {
        console.error('Error loading user data:', error);
        setUserEmail('user@example.com');
        setUserFullName('User');
      }
    };

    loadUserData();

    // Also reload when window becomes visible (user returns from account page)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void refreshEntitlement();
        loadUserData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshEntitlement, supabase]);

  // Sync userFullName when userProfile.full_name changes (from parent component updates)
  useEffect(() => {
    if (userProfile.full_name && !isEditing) {
      setUserFullName(userProfile.full_name);
    }
  }, [userProfile.full_name, isEditing]);



  // Handle search distance change - update Supabase
  // IMPORTANT: This function MUST NOT send any chat messages or trigger AI prompts.
  // Radius changes should only update state and refresh meal results - never post to chat.
  // This path is retained for the upcoming search-distance settings UI.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSearchDistanceChange = async (distance: number) => {
    setUpdateError(null);
    
    // 1) PROVE WHAT WE ARE UPDATING - Comprehensive debugging
    console.log('=== RADIUS UPDATE DEBUG ===');
    console.log('Column name:', 'search_distance_miles');
    console.log('Value being saved:', distance, 'Type:', typeof distance);
    console.log('userProfile loaded:', !!userProfile, 'Keys:', userProfile ? Object.keys(userProfile) : 'N/A');
    
    // Update local state immediately for instant feedback (UX requirement)
    // DO NOT set seekeatz_pending_chat_message or call any chat functions here
    const updatedProfile = { 
      ...userProfile, 
      search_distance_miles: distance,
    };
    onUpdateProfile(updatedProfile);
    
    // Also update localStorage immediately so it works even if DB fails
    localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
    
    // Get authenticated user
    let user;
    try {
      const authResult = await supabase.auth.getUser();
      user = authResult.data?.user;
      
      if (!user || !user.id) {
        console.log('No user id available - skipping DB update');
        console.log('Auth result:', { 
          hasUser: !!authResult.data?.user, 
          userId: authResult.data?.user?.id,
          error: authResult.error 
        });
        // Local state already updated above, so we're done
        return;
      }
      
      console.log('Authenticated user id:', user.id);
    } catch (authError) {
      console.error('Error getting user:', authError);
      // Local state already updated, continue without DB update
      return;
    }

    // Prepare update data with canonical column name
    const columnName = 'search_distance_miles';
    const valueToSave = safeNumberForDb(distance);
    
    console.log('Update payload:', {
      column: columnName,
      value: valueToSave,
      valueType: typeof valueToSave,
      userId: user.id,
      table: 'profiles'
    });

    // 2) LOG THE ACTUAL SUPABASE RESPONSE - Full response object
    try {
      const updateData: Record<string, unknown> = {
        [columnName]: valueToSave,
        updated_at: new Date().toISOString(),
      };

      const supabaseResponse = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id)
        .select();

      if (supabaseResponse.error) {
        // Handle PGRST204 (column doesn't exist) gracefully - no crash, no error spam
        if (supabaseResponse.error.code === 'PGRST204') {
          // Column missing - log one clean message and continue silently
          // Local state already updated, so UI continues working
          console.log('search_distance_miles column missing — add it to profiles to enable persistence.');
          // Do NOT set updateError - user doesn't need to see this
          // Do NOT spam console with errors
          // Radius change is already applied locally, so UX is unaffected
          // Skip all other error logging for this case
        } else {
          // For other errors, log details and show error message
          // Log the FULL response object for debugging
          console.log('=== SUPABASE RESPONSE ===');
          console.log('Full response:', JSON.stringify(supabaseResponse, null, 2));
          console.log('Response data:', supabaseResponse.data);
          console.log('Response error:', supabaseResponse.error);
          console.log('Response status:', supabaseResponse.status);
          console.log('Response statusText:', supabaseResponse.statusText);
          // For other errors, log details and show error message
          console.error('=== SUPABASE ERROR DETAILS ===');
          console.error('Error code:', supabaseResponse.error.code);
          console.error('Error message:', supabaseResponse.error.message);
          console.error('Error hint:', supabaseResponse.error.hint);
          console.error('Error details:', supabaseResponse.error.details);
          
          // Check for other specific error types
          if (supabaseResponse.error.code === '42703' || 
              supabaseResponse.error.message?.toLowerCase().includes('column') ||
              supabaseResponse.error.message?.toLowerCase().includes('does not exist')) {
            console.error('❌ COLUMN MISSING: search_distance_miles does not exist in profiles table.');
            console.error('📝 ACTION REQUIRED: Add this column to your Supabase profiles table:');
            console.error('   Column name: search_distance_miles');
            console.error('   Type: numeric or integer');
            console.error('   Nullable: true (optional)');
            console.error('   Default: null');
            setUpdateError('Search distance column not found. Check console for details.');
          } else if (supabaseResponse.error.code === '42501' || 
                     supabaseResponse.error.message?.toLowerCase().includes('permission') ||
                     supabaseResponse.error.message?.toLowerCase().includes('policy') ||
                     supabaseResponse.error.message?.toLowerCase().includes('row-level security')) {
            console.error('❌ RLS POLICY BLOCKING UPDATE');
            console.error('📝 ACTION REQUIRED: Add/update RLS policy to allow authenticated users to update their own profile:');
            console.error('   Policy name: Allow users to update own profile');
            console.error('   Table: profiles');
            console.error('   Operation: UPDATE');
            console.error('   Expression: auth.uid() = id');
            setUpdateError('Permission denied. Check console for RLS policy details.');
          } else {
            console.error('❌ UNKNOWN ERROR:', supabaseResponse.error);
            setUpdateError(`Failed to update: ${supabaseResponse.error.message || 'Unknown error'}`);
          }
          
          // Clear error after 5 seconds (only for non-PGRST204 errors)
          setTimeout(() => setUpdateError(null), 5000);
        }
      } else {
        // Success
        console.log('✅ Successfully updated search_distance_miles');
        console.log('Updated row:', supabaseResponse.data);
      }
    } catch (updateError) {
      // Only catch actual exceptions (network errors, etc.)
      console.error('=== EXCEPTION DURING UPDATE ===');
      console.error('Exception type:', typeof updateError);
      console.error('Exception:', updateError);
      if (updateError instanceof Error) {
        console.error('Error message:', updateError.message);
        console.error('Error stack:', updateError.stack);
      }
      console.error('Stringified error:', JSON.stringify(updateError, Object.getOwnPropertyNames(updateError)));
      
      setUpdateError(`Update failed: ${updateError instanceof Error ? updateError.message : 'Unknown exception'}`);
      setTimeout(() => setUpdateError(null), 5000);
    }
    
    console.log('=== END RADIUS UPDATE DEBUG ===');
  };

  // Handle theme change - save to Supabase and localStorage
  const handleThemeChange = async (newTheme: 'light' | 'dark') => {
    try {
      setTheme(newTheme);
      setSaveSuccessMessage(`${newTheme === 'dark' ? 'Dark' : 'Light'} theme applied`);

      const { data: { user }, error: authError } = await supabase.auth.getUser();

      // Guard: Log and stop early if user is missing
      if (authError || !user) {
        console.warn('⚠️ Theme change: User not authenticated');
        console.warn('   Auth error:', authError);
        console.warn('   User:', user);
        console.warn('   Theme value being saved:', newTheme);
        console.warn('   Saving to localStorage only');
        return; // Theme already saved to localStorage via setTheme above
      }

      // Use upsert to handle missing row (creates if doesn't exist, updates if exists)
      const supabaseResponse = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          theme_preference: newTheme,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'id',
        })
        .select();

      // Check if no rows were updated/inserted
      if (!supabaseResponse.error && (!supabaseResponse.data || supabaseResponse.data.length === 0)) {
        console.error('⚠️ No row updated/inserted - upsert returned empty data array');
        console.error('   This may indicate RLS is blocking the operation');
        return;
      }

      if (supabaseResponse.error) {
        // Extract all error properties for better debugging
        const supabaseError = supabaseResponse.error;
        const errorDetails = {
          message: supabaseError.message || 'Unknown error',
          code: supabaseError.code || 'NO_CODE',
          details: supabaseError.details || null,
          hint: supabaseError.hint || null,
          // Include any other properties
          ...Object.fromEntries(
            Object.entries(supabaseError).filter(([key]) => 
              !['message', 'code', 'details', 'hint'].includes(key)
            )
          ),
        };

        console.error('❌ Error saving theme to Supabase:');
        console.error('   Full error object:', supabaseError);
        console.error('   Error details:', errorDetails);
        console.error('   Error message:', supabaseError.message);
        console.error('   Error code:', supabaseError.code);
        console.error('   Error details:', supabaseError.details);
        console.error('   Error hint:', supabaseError.hint);

        // Check for specific error types
        if (supabaseError.code === '42703' || supabaseError.message?.includes('column') || supabaseError.message?.includes('does not exist')) {
          console.error('📝 ACTION REQUIRED: Add theme_preference column to profiles table:');
          console.error('   Column name: theme_preference');
          console.error('   Type: text or varchar');
          console.error('   Nullable: true (optional)');
        } else if (supabaseError.code === '42501' || 
                   supabaseError.message?.toLowerCase().includes('permission') || 
                   supabaseError.message?.toLowerCase().includes('policy') ||
                   supabaseError.message?.toLowerCase().includes('row-level security')) {
          console.error('❌ RLS POLICY BLOCKING UPDATE');
          console.error('📝 ACTION REQUIRED: Add/update RLS policy to allow authenticated users to update their own profile:');
          console.error('   Policy name: Allow users to update own profile');
          console.error('   Table: profiles');
          console.error('   Operation: UPDATE/INSERT');
          console.error('   Expression: auth.uid() = id');
        } else if (supabaseError.code === 'PGRST116' || supabaseError.message?.includes('No rows')) {
          console.warn('⚠️ Profile row does not exist, but upsert should have created it. This may indicate an RLS issue.');
        } else {
          console.error('❌ UNKNOWN ERROR:', errorDetails);
        }
        // Don't throw - theme is already saved to localStorage, so UI works fine
      } else {
        // Success - theme saved to Supabase (already saved to localStorage via setTheme above)
        console.log('✅ Theme preference saved to Supabase');
      }
    } catch (exception: unknown) {
      // Catch any unexpected exceptions (network errors, etc.)
      // Renamed to 'exception' to avoid shadowing Supabase error variable
      console.error('=== EXCEPTION DURING THEME SAVE ===');
      console.error('Exception type:', typeof exception);
      console.error('Exception:', exception);
      if (exception instanceof Error) {
        console.error('Error message:', exception.message);
        console.error('Error stack:', exception.stack);
      } else {
        console.error('Non-Error exception:', JSON.stringify(exception, null, 2));
      }
      // Don't throw - theme is already saved to localStorage, so UI works fine
    }
  };

  const getRandomMealSuggestion = () => {
    try {
      const items = cavaData?.items ?? [];
      if (!items.length) return null;

      const randomItem = items[Math.floor(Math.random() * items.length)];
      const calories = randomItem.macros?.calories;
      const protein = randomItem.macros?.protein;

      const title = `Meal from ${cavaData.restaurant_name}`;
      const bodyParts = [`${randomItem.name}`];
      if (typeof calories === 'number') bodyParts.push(`${calories} cal`);
      if (typeof protein === 'number') bodyParts.push(`${protein}g protein`);

      return {
        title,
        body: bodyParts.join(' | '),
      };
    } catch (err) {
      console.error('Error selecting meal suggestion:', err);
      return null;
    }
  };

  // Handle notification toggle
  const handleNotificationChange = (
    key: NotificationPreferenceKey,
    value: boolean
  ) => {
    const nextPreferences: NotificationPreferences = {
      mealSuggestions,
      dailySummary,
      progressReminders,
      [key]: value,
    };

    applyNotificationPreferences(nextPreferences);

    if (typeof window !== 'undefined') {
      localStorage.setItem(notificationStorageKey, JSON.stringify(nextPreferences));
    }

    setSaveSuccessMessage('Notification preferences updated');

    if (key === 'mealSuggestions' && value) {
      (async () => {
        const permission = await requestNotificationPermission();
        if (permission === 'granted') {
          const suggestion = getRandomMealSuggestion();
          if (suggestion) {
            sendMealSuggestionNotification(suggestion);
          }
        }
      })();
    }
  };

  // Handle edit mode toggle
  const handleEditClick = () => {
    setEditedProfile(userProfile);
    setSaveSuccessMessage(null);
    setInputValues({
      full_name: userProfile.full_name || userFullName || '',
      target_calories: safeNumberToString(userProfile.target_calories),
      target_protein_g: safeNumberToString(userProfile.target_protein_g),
      target_carbs_g: safeNumberToString(userProfile.target_carbs_g),
      target_fats_g: safeNumberToString(userProfile.target_fats_g),
    });
    setIsEditing(true);
    setEditError(null);
  };

  // Handle cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedProfile(userProfile);
    setSaveSuccessMessage(null);
    setInputValues({
      full_name: userProfile.full_name || userFullName || '',
      target_calories: safeNumberToString(userProfile.target_calories),
      target_protein_g: safeNumberToString(userProfile.target_protein_g),
      target_carbs_g: safeNumberToString(userProfile.target_carbs_g),
      target_fats_g: safeNumberToString(userProfile.target_fats_g),
    });
    setEditError(null);
  };

  // Handle save profile changes
  const handleSaveProfile = async () => {
    setIsSaving(true);
    setEditError(null);
    setUpdateError(null);

    try {
      // Convert string inputs to numbers (null if empty/invalid)
      const target_calories = safeStringToNumber(inputValues.target_calories);
      const target_protein_g = safeStringToNumber(inputValues.target_protein_g);
      const target_carbs_g = safeStringToNumber(inputValues.target_carbs_g);
      const target_fats_g = safeStringToNumber(inputValues.target_fats_g);

      // Validate inputs (only validate if values are provided)
      if (target_calories !== null) {
        if (target_calories < 500 || target_calories > 5000) {
          setEditError('Calorie target must be between 500 and 5000');
          setIsSaving(false);
          return;
        }
      }

      if (target_protein_g !== null) {
        if (target_protein_g < 0 || target_protein_g > 500) {
          setEditError('Protein target must be between 0 and 500g');
          setIsSaving(false);
          return;
        }
      }

      if (target_carbs_g !== null) {
        if (target_carbs_g < 0 || target_carbs_g > 600) {
          setEditError('Carbs target must be between 0 and 600g');
          setIsSaving(false);
          return;
        }
      }

      if (target_fats_g !== null) {
        if (target_fats_g < 0 || target_fats_g > 300) {
          setEditError('Fats target must be between 0 and 300g');
          setIsSaving(false);
          return;
        }
      }

      // Create updated profile with numeric values (null for empty inputs)
      const updatedProfile = {
        ...editedProfile,
        full_name: inputValues.full_name.trim() || undefined,
        target_calories: target_calories ?? undefined,
        target_protein_g: target_protein_g ?? undefined,
        target_carbs_g: target_carbs_g ?? undefined,
        target_fats_g: target_fats_g ?? undefined,
      };

      // Update local state first so the app reflects the new goals immediately.
      onUpdateProfile(updatedProfile);
      setEditedProfile(updatedProfile);
      
      // Update userFullName state for display
      if (inputValues.full_name.trim()) {
        setUserFullName(inputValues.full_name.trim());
      }
      
      // Update localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
      }

      setIsEditing(false);
      setSaveSuccessMessage('Profile updated');

      // Sync to Supabase in the background so a slow network never traps the UI in "Saving...".
      void (async () => {
        try {
          const authResult = await Promise.race([
            supabase.auth.getUser(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timed out while verifying your account.')), 8000)
            ),
          ]);

          const user = authResult.data.user;
          if (!user) {
            return;
          }

          const dbColumns = profileToDbColumns(updatedProfile);
          const saveResult = await Promise.race([
            supabase
              .from('profiles')
              .upsert({
                id: user.id,
                ...dbColumns,
                updated_at: new Date().toISOString(),
              }, {
                onConflict: 'id',
              }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('Timed out while syncing your profile.')), 8000)
            ),
          ]);

          if (saveResult.error) {
            console.error('Error syncing profile:', saveResult.error);
            setUpdateError(`Saved locally. Cloud sync may be delayed: ${saveResult.error.message}`);
          }
        } catch (syncError) {
          console.error('Error syncing profile in background:', syncError);
          setUpdateError(
            `Saved locally. Cloud sync may be delayed: ${
              syncError instanceof Error ? syncError.message : 'Unknown sync error'
            }`
          );
        }
      })();
    } catch (err) {
      console.error('Error saving profile:', err);
      setEditError('An unexpected error occurred. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Update editedProfile and inputValues when userProfile changes (only when not editing)
  useEffect(() => {
    if (!isEditing) {
      setEditedProfile(userProfile);
      setInputValues({
        full_name: userProfile.full_name || userFullName || '',
        target_calories: safeNumberToString(userProfile.target_calories),
        target_protein_g: safeNumberToString(userProfile.target_protein_g),
        target_carbs_g: safeNumberToString(userProfile.target_carbs_g),
        target_fats_g: safeNumberToString(userProfile.target_fats_g),
      });
    }
  }, [userProfile, isEditing, userFullName]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const storedPreferences = localStorage.getItem(notificationStorageKey);
    if (!storedPreferences) {
      applyNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
      return;
    }

    try {
      const parsedPreferences = JSON.parse(storedPreferences) as Partial<NotificationPreferences>;
      applyNotificationPreferences({
        mealSuggestions: parsedPreferences.mealSuggestions ?? false,
        dailySummary: parsedPreferences.dailySummary ?? false,
        progressReminders: parsedPreferences.progressReminders ?? false,
      });
    } catch (error) {
      console.error('Error loading notification preferences:', error);
      applyNotificationPreferences(DEFAULT_NOTIFICATION_PREFERENCES);
    }
  }, [notificationStorageKey]);


  // Handle logout
  const handleLogout = async () => {
    if (confirm('Are you sure you want to log out?')) {
      try {
        clearChat();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('seekeatz_start_app_tutorial');
        }
        await supabase.auth.signOut();
      } catch (error) {
        console.error('Error signing out:', error);
      } finally {
        router.replace('/auth/signin?loggedOut=1');
        router.refresh();
      }
    }
  };

  const isLightTheme = theme === 'light' || resolvedTheme === 'light';
  const isDarkTheme = theme === 'dark' || resolvedTheme === 'dark';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background h-full">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-4">
        {showPrivacyPolicy && (
          <button
            type="button"
            onClick={() => setShowPrivacyPolicy(false)}
            className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
        )}
        <h1 className="text-xl font-semibold text-foreground">
          {showPrivacyPolicy ? 'Privacy Policy' : 'Settings'}
        </h1>
      </div>

      {/* Content */}
      {!showPrivacyPolicy ? (
      <div className="flex-1 space-y-4 overflow-y-auto bg-background px-4 py-5 pb-[calc(var(--app-nav-safe-offset)+5.5rem)] sm:px-6 sm:py-6 sm:pb-28">
        {/* Profile & Goals Section */}
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          <div className="border-b border-border/70 bg-gradient-to-r from-sky-500/10 via-cyan-500/10 to-transparent px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex size-11 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                  <User className="size-5" />
                </div>
                <div className="space-y-1">
                  <h2 className="text-lg font-semibold text-foreground">Profile & Goals</h2>
                  <p className="text-sm text-muted-foreground">
                    Manage your identity and the calorie and macro targets used throughout the app.
                  </p>
                </div>
              </div>
              {!isEditing ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEditClick}
                  data-tutorial-target="settings-edit-profile"
                  className="h-9 rounded-lg px-4 text-black hover:text-black dark:text-white dark:hover:text-white"
                >
                  <Edit className="mr-2 size-4" />
                  Edit Profile
                </Button>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="h-9 rounded-lg px-4 text-black hover:text-black dark:text-white dark:hover:text-white"
                  >
                    <X className="mr-2 size-4" />
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveProfile}
                    disabled={isSaving}
                    className="h-9 rounded-lg px-4"
                  >
                    {isSaving ? (
                      <>
                        <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current/25 border-t-current"></div>
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 size-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4 px-6 py-6">
            {saveSuccessMessage && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">
                {saveSuccessMessage}
              </div>
            )}
            {editError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
                {editError}
              </div>
            )}
            {updateError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950/20 dark:text-red-400">
                {updateError}
              </div>
            )}

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="rounded-2xl border border-border/70 bg-background/60 p-5">
                <div className="mb-4 flex items-center gap-3">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-foreground">
                    {getInitials(isEditing ? inputValues.full_name : (userProfile.full_name || userFullName))}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Identity
                    </p>
                    <p className="text-sm text-muted-foreground">
                      This name is used across your home, log, and chat experience.
                    </p>
                  </div>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <Label htmlFor="full_name" className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Full Name
                    </Label>
                    <Input
                      id="full_name"
                      type="text"
                      value={inputValues.full_name}
                      onChange={(e) => setInputValues(prev => ({ ...prev, full_name: e.target.value }))}
                      placeholder="Enter your name"
                      className="h-10 text-base font-medium"
                      autoFocus
                    />
                    <p className="text-sm text-muted-foreground">
                      Your email stays tied to your account and cannot be edited here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <h3 className="truncate text-lg font-semibold text-foreground">
                      {userProfile.full_name || userFullName || 'User'}
                    </h3>
                    <p className="truncate text-sm text-muted-foreground">
                      {userEmail || 'user@example.com'}
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-border/70 bg-background/60 p-5">
                <div className="mb-3">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                    Daily Targets
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    These goals power your log screen, meal-detail previews, and personalized meal matching.
                  </p>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-xl border border-border/70 bg-card/80 p-3.5">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Daily Calories</p>
                    {isEditing ? (
                      <>
                        <Input
                          type="number"
                          min="500"
                          max="5000"
                          step="50"
                          value={inputValues.target_calories}
                          onChange={(e) => setInputValues(prev => ({
                            ...prev,
                            target_calories: e.target.value
                          }))}
                          className="mt-2.5 h-9 text-sm font-semibold"
                        />
                        <p className="mt-1.5 text-[11px] text-muted-foreground">500-5000 cal</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2.5 text-xl font-semibold text-foreground">
                          {safeNumberToString(userProfile.target_calories) || 'Not set'}{safeNumberToString(userProfile.target_calories) ? ' cal' : ''}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Daily energy target</p>
                      </>
                    )}
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card/80 p-3.5">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Protein</p>
                    {isEditing ? (
                      <>
                        <Input
                          type="number"
                          min="0"
                          max="500"
                          step="5"
                          value={inputValues.target_protein_g}
                          onChange={(e) => setInputValues(prev => ({
                            ...prev,
                            target_protein_g: e.target.value
                          }))}
                          className="mt-2.5 h-9 text-sm font-semibold"
                        />
                        <p className="mt-1.5 text-[11px] text-muted-foreground">0-500g</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2.5 text-lg font-semibold text-foreground">
                          {safeNumberToString(userProfile.target_protein_g) || 'Not set'}{safeNumberToString(userProfile.target_protein_g) ? 'g' : ''}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Daily protein target</p>
                      </>
                    )}
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card/80 p-3.5">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Carbs</p>
                    {isEditing ? (
                      <>
                        <Input
                          type="number"
                          min="0"
                          max="600"
                          step="10"
                          value={inputValues.target_carbs_g}
                          onChange={(e) => setInputValues(prev => ({
                            ...prev,
                            target_carbs_g: e.target.value
                          }))}
                          className="mt-2.5 h-9 text-sm font-semibold"
                        />
                        <p className="mt-1.5 text-[11px] text-muted-foreground">0-600g</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2.5 text-lg font-semibold text-foreground">
                          {safeNumberToString(userProfile.target_carbs_g) || 'Not set'}{safeNumberToString(userProfile.target_carbs_g) ? 'g' : ''}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Daily carb target</p>
                      </>
                    )}
                  </div>

                  <div className="rounded-xl border border-border/70 bg-card/80 p-3.5">
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Fats</p>
                    {isEditing ? (
                      <>
                        <Input
                          type="number"
                          min="0"
                          max="300"
                          step="5"
                          value={inputValues.target_fats_g}
                          onChange={(e) => setInputValues(prev => ({
                            ...prev,
                            target_fats_g: e.target.value
                          }))}
                          className="mt-2.5 h-9 text-sm font-semibold"
                        />
                        <p className="mt-1.5 text-[11px] text-muted-foreground">0-300g</p>
                      </>
                    ) : (
                      <>
                        <p className="mt-2.5 text-lg font-semibold text-foreground">
                          {safeNumberToString(userProfile.target_fats_g) || 'Not set'}{safeNumberToString(userProfile.target_fats_g) ? 'g' : ''}
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">Daily fat target</p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Appearance Section */}
        <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-foreground">Appearance</h2>
            <p className="mt-1 text-sm text-muted-foreground">Choose the interface that feels best for everyday meal tracking.</p>
          </div>
          <Label className="mb-3 block text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Theme</Label>
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            <button
              onClick={() => handleThemeChange('light')}
              className={`rounded-2xl border p-4 text-left transition-all ${
                isLightTheme
                  ? 'border-sky-500/40 bg-sky-500/10 shadow-[0_0_0_1px_rgba(14,165,233,0.15)]'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`flex size-10 items-center justify-center rounded-xl ${isLightTheme ? 'bg-white text-sky-700 shadow-sm' : 'bg-muted text-muted-foreground'}`}>
                    <Sun className="size-4" />
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${isLightTheme ? 'text-foreground' : 'text-foreground'}`}>Light</p>
                    <p className="text-xs text-muted-foreground">Bright, clean, and easy to scan.</p>
                  </div>
                </div>
                <div className={`size-3 rounded-full ${isLightTheme ? 'bg-sky-500' : 'bg-border'}`}></div>
              </div>
            </button>
            <button
              onClick={() => handleThemeChange('dark')}
              className={`rounded-2xl border p-4 text-left transition-all ${
                isDarkTheme
                  ? 'border-sky-500/40 bg-sky-500/10 shadow-[0_0_0_1px_rgba(14,165,233,0.15)]'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className={`flex size-10 items-center justify-center rounded-xl ${isDarkTheme ? 'bg-slate-950 text-sky-300 shadow-sm dark:bg-slate-900' : 'bg-muted text-muted-foreground'}`}>
                    <Moon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Dark</p>
                    <p className="text-xs text-muted-foreground">Lower glare with stronger contrast at night.</p>
                  </div>
                </div>
                <div className={`size-3 rounded-full ${isDarkTheme ? 'bg-sky-500' : 'bg-border'}`}></div>
              </div>
            </button>
          </div>
        </div>

        {/* Notifications Section */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-base font-medium text-foreground mb-4">Notifications</h2>
          <div className="space-y-4">
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
        <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                <CreditCard className="size-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground">Subscription</h2>
              </div>
            </div>
            <span className="rounded-full border border-border/70 bg-muted px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {subscriptionPlanLabel}
            </span>
          </div>

          <div className="mt-5 rounded-2xl border border-sky-500/15 bg-gradient-to-br from-sky-500/[0.08] via-background to-background p-5">
            <p className="text-base font-semibold text-foreground">
              {!entitlement.hasPremiumAccess
                ? 'Upgrade for unlimited home search, AI chat, meal logging, saved meals, and premium tools.'
                : entitlement.billingStatus === 'trialing'
                  ? 'Your waitlist free month is active and all premium features are unlocked.'
                  : entitlement.billingTier === 'yearly'
                    ? 'Your yearly plan unlocks full access to everything SeekEatz offers.'
                    : 'Your monthly plan unlocks full access to everything SeekEatz offers.'}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {!entitlement.hasPremiumAccess
                ? 'Free accounts get 2 total searches every rolling 24 hours across Home and AI Chat. Logging and saved meals still require premium.'
                : entitlement.billingStatus === 'trialing' && entitlement.trialExpiresAt
                  ? `Your free month ends on ${new Date(entitlement.trialExpiresAt).toLocaleDateString()}.`
                  : 'Manage your plan details or review upgrade options on the subscription screen.'}
            </p>
            <Button
              onClick={() => router.push('/upgrade')}
              className="mt-4 w-full"
            >
              {!entitlement.hasPremiumAccess ? 'View Plans' : 'Manage Subscription'}
            </Button>
          </div>
        </div>

        {/* Help & Support Section */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-base font-medium text-foreground mb-4">Help & Support</h2>
          <div className="space-y-1">
            <button
              onClick={() => router.push('/help/faq')}
              className="w-full flex items-center justify-between p-3 hover:bg-muted rounded-md transition-colors"
            >
              <div className="flex items-center gap-3">
                <HelpCircle className="size-4 text-muted-foreground" />
                <span className="text-foreground">FAQ</span>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
            
            <button
              onClick={() => router.push('/help/contact')}
              className="w-full flex items-center justify-between p-3 hover:bg-muted rounded-md transition-colors"
            >
              <div className="flex items-center gap-3">
                <MessageCircle className="size-4 text-muted-foreground" />
                <span className="text-foreground">Contact Support</span>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
            
            <button
              onClick={() => router.push('/legal/terms')}
              className="w-full flex items-center justify-between p-3 hover:bg-muted rounded-md transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="size-4 text-muted-foreground" />
                <span className="text-foreground">Terms of Service</span>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
            
            <button
              onClick={() => router.push('/legal/privacy')}
              className="w-full flex items-center justify-between p-3 hover:bg-muted rounded-md transition-colors"
            >
              <div className="flex items-center gap-3">
                <Shield className="size-4 text-muted-foreground" />
                <span className="text-foreground">Privacy Policy</span>
              </div>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Account Section */}
        <div className="rounded-2xl border border-red-200 bg-red-50/70 p-6 shadow-sm dark:border-red-900 dark:bg-red-950/15">
          <div className="mb-4 space-y-1">
            <h2 className="text-base font-semibold text-foreground">Account</h2>
            <p className="text-sm text-muted-foreground">
              Sign out of your account on this device.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-red-200 bg-background/90 p-3 transition-colors hover:bg-red-50 dark:border-red-800 dark:bg-background/40 dark:hover:bg-red-950/20"
          >
            <LogOut className="size-4 text-red-600 dark:text-red-400" />
            <span className="font-medium text-red-600 dark:text-red-400">Log Out</span>
          </button>
        </div>
      </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-background px-4 py-6 pb-[calc(var(--app-nav-safe-offset)+5.5rem)] sm:px-6 sm:pb-28">
          <div className="mx-auto max-w-3xl space-y-5">
            <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm space-y-3 text-sm leading-7 text-muted-foreground">
              <h2 className="text-xl font-semibold text-foreground">Privacy Policy</h2>
              <p className="text-sm font-medium text-foreground">Last updated: March 17, 2026</p>
              <p>
                <span className="font-semibold text-foreground">SeekEatz</span> (&quot;SeekEatz,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) respects your privacy and is committed to protecting the information you share with us.
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our applications, website,
                and related services (the &quot;Service&quot;).
              </p>
              <p>
                By using the Service, you agree to the practices described in this Privacy Policy. If you do not agree with this policy, please do not use the Service.
              </p>
            </div>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-foreground">1. Information We Collect</h3>
              <p>We collect information in the following ways:</p>

              <p className="font-semibold text-foreground">Information You Provide</p>
              <p>When you create an account or use certain features, you may provide information such as:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Name and email address</li>
                <li>Account authentication details</li>
                <li>Dietary preferences, goals, and restrictions</li>
                <li>Target calories, macros, or other nutritional goals</li>
                <li>Meals you log, favorite, or save</li>
                <li>Searches and interactions within the app</li>
                <li>Messages or prompts sent through AI chat features</li>
                <li>Feedback, ratings, or comments you choose to provide</li>
              </ul>

              <p className="font-semibold text-foreground">Automatically Collected Information</p>
              <p>When you use the Service, certain technical information may be collected automatically, including:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Device type and operating system</li>
                <li>App version</li>
                <li>IP address</li>
                <li>Language settings</li>
                <li>Diagnostic information such as crash reports and performance data</li>
              </ul>

              <p className="font-semibold text-foreground">Location Information (Optional)</p>
              <p>
                If you enable location services, we may collect approximate or precise location data in order to show restaurants and menu items near you.
                You can disable location access at any time through your device settings.
              </p>

              <p className="font-semibold text-foreground">Information from Third Parties</p>
              <p>We may receive limited information from third-party services that support our platform, such as:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Authentication providers</li>
                <li>Analytics tools</li>
                <li>Restaurant and menu data providers</li>
              </ul>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-foreground">2. How We Use Your Information</h3>
              <p>We use collected information to operate and improve SeekEatz, including to:</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Provide core features such as meal discovery, logging, and recommendations</li>
                <li>Personalize results based on your goals, preferences, and location (if enabled)</li>
                <li>Generate AI-powered responses and recommendations</li>
                <li>Maintain and improve the functionality, performance, and reliability of the Service</li>
                <li>Detect, prevent, and address security or misuse issues</li>
                <li>Communicate with you regarding updates, service notices, or account matters</li>
                <li>Comply with legal obligations and enforce our terms</li>
              </ul>
              <p>
                We do not sell your personal information. We may use or share aggregated or anonymized data that cannot reasonably identify you.
              </p>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-foreground">3. AI Features and Your Data</h3>
              <p>
                SeekEatz includes AI-powered features designed to help users discover meals and receive personalized recommendations.
              </p>
              <p>
                To generate responses, certain inputs such as chat messages, search queries, and relevant profile information may be processed by AI service providers
                operating on our behalf.
              </p>
              <p>
                We may review aggregated or anonymized interaction data to improve the performance, accuracy, and safety of these AI features.
              </p>
              <p className="font-semibold text-foreground">
                SeekEatz provides informational tools and recommendations only and is not a substitute for professional medical, nutritional, or healthcare advice.
                Always consult qualified professionals regarding health or dietary decisions.
              </p>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-foreground">4. Cookies and Similar Technologies</h3>
              <p>
                We may use cookies, local storage, and similar technologies to:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Keep you signed in</li>
                <li>Remember preferences and settings</li>
                <li>Understand how the Service is used</li>
                <li>Improve functionality and performance</li>
              </ul>
              <p>
                You can control cookie settings through your browser or device. Some features may not function properly if cookies are disabled.
              </p>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-foreground">5. How We Share Information</h3>
              <p>We may share information in the following situations:</p>
              <p className="font-semibold text-foreground">Service Providers</p>
              <p>
                We work with trusted third-party providers that assist with hosting, analytics, infrastructure, customer support, and related services.
                These providers process information only on our behalf and under contractual safeguards.
              </p>
              <p className="font-semibold text-foreground">AI Infrastructure Providers</p>
              <p>
                AI providers may process user inputs in order to generate responses or recommendations within the Service.
              </p>
              <p className="font-semibold text-foreground">Business Transactions</p>
              <p>
                If SeekEatz is involved in a merger, acquisition, financing, or sale of assets, user information may be transferred as part of that transaction.
              </p>
              <p className="font-semibold text-foreground">Legal and Safety Requirements</p>
              <p>
                We may disclose information if required by law or when necessary to protect the rights, safety, or property of SeekEatz, our users, or others.
              </p>
              <p>
                We do not share personal information with third parties for their independent marketing purposes without your consent.
              </p>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-foreground">6. Data Retention</h3>
              <p>
                We retain personal information only for as long as necessary to provide the Service and fulfill legitimate business or legal obligations.
              </p>
              <p>
                When information is no longer needed, we take reasonable steps to delete or anonymize it.
              </p>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-foreground">7. Security</h3>
              <p>
                We implement reasonable technical and organizational safeguards designed to protect your information, including encryption in transit,
                access controls, and system monitoring.
              </p>
              <p>
                However, no system can be guaranteed completely secure, and users are responsible for maintaining the confidentiality of their account credentials.
              </p>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-foreground">8. Your Rights and Choices</h3>
              <p>
                Depending on your location, you may have rights regarding your personal information, including the ability to:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Access or correct your data</li>
                <li>Request deletion of your information</li>
                <li>Object to certain processing activities</li>
                <li>Request a copy of your data</li>
              </ul>
              <p>
                Many changes can be made directly within the app, such as updating profile information or deleting logged meals.
              </p>
              <p>
                For additional requests, please contact us using the information below. We may need to verify your identity before fulfilling requests.
              </p>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-foreground">9. Children&apos;s Privacy</h3>
              <p>
                SeekEatz is not intended for children under the age of 13 (or under 16 in certain jurisdictions). We do not knowingly collect personal
                information from children in these age groups.
              </p>
              <p>
                If we become aware that personal information from a child has been collected, we will take steps to delete it. If you believe this has occurred,
                please contact us.
              </p>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-foreground">10. Third-Party Links</h3>
              <p>
                The Service may contain links to third-party websites or services. SeekEatz is not responsible for the privacy practices of those third parties,
                and we encourage you to review their privacy policies.
              </p>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-foreground">11. Changes to This Policy</h3>
              <p>
                We may update this Privacy Policy periodically to reflect changes in our practices, technology, or legal requirements. When updates occur,
                the &quot;Last updated&quot; date will be revised.
              </p>
              <p>
                Continued use of the Service after changes become effective constitutes acceptance of the updated policy.
              </p>
            </section>

            <section className="rounded-2xl border border-border/70 bg-card/70 p-5 text-sm leading-7 text-muted-foreground shadow-sm space-y-3">
              <h3 className="text-base font-semibold text-foreground">12. Contact Us</h3>
              <p>
                If you have questions about this Privacy Policy or our data practices, please contact us at:
              </p>
              <p className="text-foreground">
                <span className="font-semibold">Email:</span> support@seekeatz.com
              </p>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

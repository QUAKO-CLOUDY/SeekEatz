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
  X
} from 'lucide-react';
import { Button } from './ui/button';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { useTheme } from '../contexts/ThemeContext';
import { useChat } from '../contexts/ChatContext';
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
  const { clearChat } = useChat();
  
  // User data state
  const [userEmail, setUserEmail] = useState<string>('');
  const [userFullName, setUserFullName] = useState<string>('');
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [updateError, setUpdateError] = useState<string | null>(null);

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
    const columns: Record<string, any> = {
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
  
  // State for "Other" diet type input
  const [showOtherDietInput, setShowOtherDietInput] = useState(false);
  const [customDietType, setCustomDietType] = useState<string>('');
  
  // State for "Other" dietary options input
  const [showOtherDietaryInput, setShowOtherDietaryInput] = useState(false);
  const [customDietaryOption, setCustomDietaryOption] = useState<string>('');
  
  // Notification preferences - local-only for now
  const [mealSuggestions, setMealSuggestions] = useState(false);
  const [dailySummary, setDailySummary] = useState(false);
  const [progressReminders, setProgressReminders] = useState(false);

  // Migrate 'auto' theme to 'light' on mount
  useEffect(() => {
    const currentTheme = localStorage.getItem('seekeatz-theme');
    if (currentTheme === 'auto') {
      // Migrate to light theme (default)
      setTheme('light');
      localStorage.setItem('seekeatz-theme', 'light');
    }
  }, []);

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
            const safeNumber = (val: any): number | undefined => {
              if (val === null || val === undefined || isNaN(val)) {
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
                } catch (error: any) {
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
      } finally {
        setIsLoadingProfile(false);
      }
    };

    loadUserData();

    // Also reload when window becomes visible (user returns from account page)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadUserData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  // Sync userFullName when userProfile.full_name changes (from parent component updates)
  useEffect(() => {
    if (userProfile.full_name && !isEditing) {
      setUserFullName(userProfile.full_name);
    }
  }, [userProfile.full_name, isEditing]);

  // Handle diet type change - update Supabase (single selection: click to select, click again to deselect)
  const handleDietTypeChange = async (dietType: string) => {
    try {
      setUpdateError(null);
      const { data: { user } } = await supabase.auth.getUser();
      
      const currentDietType = userProfile.diet_type;
      // Toggle: if already selected, clear it; otherwise set it
      const updatedDietType = currentDietType === dietType ? undefined : dietType;
      
      const updatedProfile = { 
        ...userProfile, 
        diet_type: updatedDietType,
      };
      
      // Update local state immediately for instant feedback
      onUpdateProfile(updatedProfile);

      if (!user) {
        // If not logged in, still update local state and localStorage
        localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
        return;
      }

      // Convert to flat database columns
      const dbColumns = profileToDbColumns(updatedProfile);

      // Update in Supabase using flat columns with .update()
      const { error } = await supabase
        .from('profiles')
        .update({
          ...dbColumns,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error updating diet type:', error);
        setUpdateError(`Failed to update diet type: ${error.message}`);
        // Revert on error
        onUpdateProfile(userProfile);
        // Clear error after 5 seconds
        setTimeout(() => setUpdateError(null), 5000);
      } else {
        // Also update localStorage
        localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
      }
    } catch (error) {
      console.error('Error saving diet type:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setUpdateError(`Failed to update diet type: ${errorMessage}`);
      // Revert on error
      onUpdateProfile(userProfile);
      // Clear error after 5 seconds
      setTimeout(() => setUpdateError(null), 5000);
    }
  };

  // Handle "Other" diet type
  const handleOtherDietTypeSubmit = async () => {
    if (!customDietType.trim()) {
      setShowOtherDietInput(false);
      return;
    }
    
    await handleDietTypeChange(customDietType.trim());
    setCustomDietType('');
    setShowOtherDietInput(false);
  };

  // Handle clicking "Other" button
  const handleOtherDietTypeClick = () => {
    if (showOtherDietInput) {
      // If already showing, submit the custom diet type
      handleOtherDietTypeSubmit();
    } else {
      // Show the input field
      setShowOtherDietInput(true);
    }
  };

  // Handle dietary options change - update Supabase
  const handleDietaryOptionsChange = async (option: string, isSelected: boolean) => {
    try {
      setUpdateError(null);
      const { data: { user } } = await supabase.auth.getUser();
      
      const currentOptions = userProfile.dietary_options || [];
      const updatedOptions = isSelected
        ? [...currentOptions, option]
        : currentOptions.filter(opt => opt !== option);

      const updatedProfile = { ...userProfile, dietary_options: updatedOptions };
      
      // Update local state immediately for instant feedback
      onUpdateProfile(updatedProfile);

      if (!user) {
        // If not logged in, just update localStorage
        localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
        return;
      }

      // Convert to flat database columns
      const dbColumns = profileToDbColumns(updatedProfile);
      // Always include dietary_options, even if empty array
      dbColumns.dietary_options = updatedOptions;

      // Update in Supabase using flat columns with .update()
      const { error } = await supabase
        .from('profiles')
        .update({
          ...dbColumns,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error updating dietary options:', error);
        setUpdateError(`Failed to update dietary options: ${error.message}`);
        // Revert on error
        onUpdateProfile(userProfile);
        // Clear error after 5 seconds
        setTimeout(() => setUpdateError(null), 5000);
      } else {
        // Also update localStorage
        localStorage.setItem('userProfile', JSON.stringify(updatedProfile));
      }
    } catch (error) {
      console.error('Error saving dietary options:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setUpdateError(`Failed to update dietary options: ${errorMessage}`);
      // Revert on error
      onUpdateProfile(userProfile);
      // Clear error after 5 seconds
      setTimeout(() => setUpdateError(null), 5000);
    }
  };

  // Handle "Other" dietary option submit
  const handleOtherDietaryOptionSubmit = async () => {
    if (!customDietaryOption.trim()) {
      setShowOtherDietaryInput(false);
      return;
    }
    
    const trimmedOption = customDietaryOption.trim();
    // Check if it's already in the list
    const currentOptions = userProfile.dietary_options || [];
    if (currentOptions.includes(trimmedOption)) {
      // If already selected, deselect it
      await handleDietaryOptionsChange(trimmedOption, false);
    } else {
      // Add the custom option
      await handleDietaryOptionsChange(trimmedOption, true);
    }
    
    setCustomDietaryOption('');
    setShowOtherDietaryInput(false);
  };

  // Handle clicking "Other" button for dietary options
  const handleOtherDietaryOptionClick = () => {
    if (showOtherDietaryInput) {
      // If already showing, submit the custom dietary option
      handleOtherDietaryOptionSubmit();
    } else {
      // Show the input field
      setShowOtherDietaryInput(true);
    }
  };

  // Handle search distance change - update Supabase
  // IMPORTANT: This function MUST NOT send any chat messages or trigger AI prompts.
  // Radius changes should only update state and refresh meal results - never post to chat.
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
      const updateData: Record<string, any> = {
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
      // Update theme immediately (UI updates regardless of Supabase success)
      setTheme(newTheme);
      
      // Note: ThemeContext already saves to localStorage with 'seekeatz-theme' key

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
    } catch (exception: any) {
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

  // Handle edit mode toggle
  const handleEditClick = () => {
    setEditedProfile(userProfile);
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

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setEditError('You must be logged in to save changes');
        setIsSaving(false);
        return;
      }

      // Convert to flat database columns
      const dbColumns = profileToDbColumns(updatedProfile);

      // Update Supabase using flat columns with .update()
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          ...dbColumns,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Error updating profile:', updateError);
        setEditError(`Failed to save changes: ${updateError.message}`);
        setIsSaving(false);
        return;
      }

      // Update local state
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


  // Handle logout
  const handleLogout = async () => {
    if (confirm('Are you sure you want to log out?')) {
      try {
        clearChat();
        await supabase.auth.signOut();
      } catch (error) {
        console.error('Error signing out:', error);
      } finally {
        // Full page redirect so the app reloads and root page shows the landing screen
        window.location.href = '/?loggedOut=1';
      }
    }
  };

  // Diet type options
  const dietTypeOptions: Array<{ id: string; label: string }> = [
    { id: 'Regular', label: 'Regular' },
    { id: 'Vegetarian', label: 'Vegetarian' },
    { id: 'Vegan', label: 'Vegan' },
    { id: 'Pescatarian', label: 'Pescatarian' },
    { id: 'Keto', label: 'Keto' },
    { id: 'Low Carb', label: 'Low Carb' },
  ];

  // Dietary options/restrictions (allergen filters disabled for MVP)
  const dietaryOptionLabels = [
    'High Protein',
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background h-full">
      {/* Header */}
      <div className="border-b p-6">
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-background pb-24">
        {/* Profile & Goals Section */}
        <div className="bg-card border rounded-lg p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-base font-medium text-foreground">Profile & Goals</h2>
            {!isEditing ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleEditClick}
                className="h-8"
              >
                <Edit className="size-4 mr-2" />
                Edit
              </Button>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEdit}
                  disabled={isSaving}
                  className="h-8"
                >
                  <X className="size-4 mr-2" />
                  Cancel
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="h-8"
                >
                  {isSaving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-foreground mr-2"></div>
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="size-4 mr-2" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Error messages */}
          {editError && (
            <div className="mb-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-md p-3 text-sm">
              {editError}
            </div>
          )}
          {updateError && (
            <div className="mb-4 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-md p-3 text-sm">
              {updateError}
            </div>
          )}

          {/* Avatar and Name/Email */}
          <div className="flex items-center gap-4 mb-6 pb-6 border-b">
            <div className="size-12 bg-muted rounded-md flex items-center justify-center text-foreground text-sm font-medium">
              {getInitials(isEditing ? inputValues.full_name : (userProfile.full_name || userFullName))}
            </div>
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <Input
                  type="text"
                  value={inputValues.full_name}
                  onChange={(e) => setInputValues(prev => ({ ...prev, full_name: e.target.value }))}
                  placeholder="Enter your name"
                  className="text-base font-medium h-9 mb-1"
                  autoFocus
                />
              ) : (
                <h3 className="text-base font-medium text-foreground truncate">
                  {userProfile.full_name || userFullName || 'User'}
                </h3>
              )}
              <p className="text-sm text-muted-foreground truncate">
                {userEmail || 'user@example.com'}
              </p>
            </div>
          </div>

          {/* Macro Targets */}
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between py-3 border-b">
              <span className="text-muted-foreground">Daily Calories</span>
              {isEditing ? (
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
                  className="w-32 h-8 text-right"
                />
              ) : (
                <span className="text-foreground font-medium">{safeNumberToString(userProfile.target_calories) || 'Not set'} cal</span>
              )}
            </div>
            <div className="flex items-center justify-between py-3 border-b">
              <span className="text-muted-foreground">Protein Target</span>
              {isEditing ? (
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
                  className="w-32 h-8 text-right"
                />
              ) : (
                <span className="text-foreground font-medium">{safeNumberToString(userProfile.target_protein_g) || 'Not set'}g</span>
              )}
            </div>
            <div className="flex items-center justify-between py-3 border-b">
              <span className="text-muted-foreground">Carbs Target</span>
              {isEditing ? (
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
                  className="w-32 h-8 text-right"
                />
              ) : (
                <span className="text-foreground font-medium">{safeNumberToString(userProfile.target_carbs_g) || 'Not set'}g</span>
              )}
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-muted-foreground">Fats Target</span>
              {isEditing ? (
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
                  className="w-32 h-8 text-right"
                />
              ) : (
                <span className="text-foreground font-medium">{safeNumberToString(userProfile.target_fats_g) || 'Not set'}g</span>
              )}
            </div>
          </div>
        </div>

        {/* Appearance Section */}
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-base font-medium text-foreground mb-4">Appearance</h2>
          <Label className="mb-3 block text-muted-foreground">Theme</Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleThemeChange('light')}
              className={`p-3 rounded-md border transition-all flex flex-col items-center justify-center gap-2 ${
                (theme === 'light' || resolvedTheme === 'light')
                  ? 'border-foreground bg-muted'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <Sun className={`size-4 ${(theme === 'light' || resolvedTheme === 'light') ? 'text-foreground' : 'text-muted-foreground'}`} />
              <p className={`text-sm ${(theme === 'light' || resolvedTheme === 'light') ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>Light</p>
            </button>
            <button
              onClick={() => handleThemeChange('dark')}
              className={`p-3 rounded-md border transition-all flex flex-col items-center justify-center gap-2 ${
                (theme === 'dark' || resolvedTheme === 'dark')
                  ? 'border-foreground bg-muted'
                  : 'border-border hover:bg-muted/50'
              }`}
            >
              <Moon className={`size-4 ${(theme === 'dark' || resolvedTheme === 'dark') ? 'text-foreground' : 'text-muted-foreground'}`} />
              <p className={`text-sm ${(theme === 'dark' || resolvedTheme === 'dark') ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>Dark</p>
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
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-base font-medium text-foreground mb-4">Subscription</h2>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-foreground font-medium">Plan: Free</p>
              <p className="text-sm text-muted-foreground">Upgrade to unlock premium features</p>
            </div>
          </div>
          <Button
            onClick={() => router.push('/settings/subscription')}
            variant="outline"
            className="w-full text-black dark:text-black hover:text-white"
          >
            Manage Subscription
          </Button>
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
        <div className="bg-card border rounded-lg p-6">
          <h2 className="text-base font-medium text-foreground mb-4">Account</h2>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-3 p-3 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
          >
            <LogOut className="size-4 text-red-600 dark:text-red-400" />
            <span className="text-red-600 dark:text-red-400 font-medium">Log Out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
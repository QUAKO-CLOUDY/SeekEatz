"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, AlertTriangle, Trash2, CreditCard, RefreshCw, ExternalLink } from 'lucide-react';
import { Button } from '@/app/components/ui/button';
import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import { createClient } from '@/utils/supabase/client';
import type { UserProfile } from '@/app/types';
import { clearCachedEntitlement, getEntitlementPlanLabel } from '@/lib/entitlements';
import { useAccountEntitlement } from '@/app/hooks/useAccountEntitlement';
import { isRevenueCatConfigured } from '@/lib/billing/apple-products';
import {
  getRevenueCatManagementUrl,
  restoreRevenueCatPurchases,
} from '@/lib/billing/revenuecat-client';
import { isNativeApp, openExternalUrl } from '@/lib/native-runtime';

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
  const { entitlement, refresh: refreshEntitlement } = useAccountEntitlement(true);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRestoringPurchases, setIsRestoringPurchases] = useState(false);
  const [isLoadingManagementUrl, setIsLoadingManagementUrl] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [billingError, setBillingError] = useState<string | null>(null);
  const [managementUrl, setManagementUrl] = useState<string | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const subscriptionPlanLabel = getEntitlementPlanLabel(entitlement);
  const nativeBillingReady = isNativeApp() && isRevenueCatConfigured();
  
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

        setAuthUserId(user.id);
        setAuthEmail(user.email ?? null);

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

  useEffect(() => {
    const loadManagementUrl = async () => {
      if (!nativeBillingReady || !authUserId) {
        setManagementUrl(null);
        return;
      }

      try {
        setIsLoadingManagementUrl(true);
        setBillingError(null);
        const url = await getRevenueCatManagementUrl({
          appUserID: authUserId,
          email: authEmail,
        });
        setManagementUrl(url);
      } catch (err) {
        console.error('Failed to load subscription management URL:', err);
        setManagementUrl(null);
      } finally {
        setIsLoadingManagementUrl(false);
      }
    };

    void loadManagementUrl();
  }, [authEmail, authUserId, nativeBillingReady]);

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

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      setDeleteError('Type DELETE to confirm account deletion.');
      return;
    }

    const confirmed = window.confirm(
      "Delete your SeekEatz account and associated data permanently? This cannot be undone. App Store subscriptions must still be managed separately through Apple.",
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ confirmationText: deleteConfirmation }),
      });

      if (!response.ok) {
        throw new Error(`Delete failed with status ${response.status}`);
      }

      clearCachedEntitlement();
      localStorage.removeItem('userProfile');
      localStorage.removeItem('seekeatz_start_app_tutorial');
      await supabase.auth.signOut();
      router.replace('/auth/signup');
      router.refresh();
    } catch (err) {
      console.error('Error deleting account:', err);
      setDeleteError('Failed to delete account. Please try again or contact support@seekeatz.com.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRestorePurchases = async () => {
    if (!authUserId) {
      setBillingError('Sign in again before restoring purchases.');
      return;
    }

    try {
      setBillingError(null);
      setIsRestoringPurchases(true);
      await restoreRevenueCatPurchases({
        appUserID: authUserId,
        email: authEmail,
      });
      await refreshEntitlement();

      const url = await getRevenueCatManagementUrl({
        appUserID: authUserId,
        email: authEmail,
      });
      setManagementUrl(url);
    } catch (err) {
      console.error('Failed to restore purchases:', err);
      setBillingError('Restore purchases failed. Try again from the iOS app or contact support@seekeatz.com.');
    } finally {
      setIsRestoringPurchases(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!managementUrl) {
      setBillingError('No active App Store subscription was found to manage yet.');
      return;
    }

    try {
      setBillingError(null);
      await openExternalUrl(managementUrl);
    } catch (err) {
      console.error('Failed to open subscription management URL:', err);
      setBillingError('Unable to open App Store subscription management.');
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
            <h1 className="text-2xl font-bold text-foreground">Account</h1>
            <p className="text-sm text-muted-foreground">Manage your profile, subscription, and account access</p>
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

        <div className="bg-card border rounded-3xl p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex size-10 items-center justify-center rounded-xl border border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300">
              <CreditCard className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Subscription</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {subscriptionPlanLabel}
                  </p>
                </div>
                <span className="rounded-full border border-border/70 bg-muted px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {entitlement.billingStatus}
                </span>
              </div>

              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {!entitlement.hasPremiumAccess
                  ? 'Free accounts get 2 searches every 24 hours across Home and AI Chat. Restore a previous purchase here or upgrade inside the iOS app.'
                  : entitlement.billingStatus === 'trialing' && entitlement.trialExpiresAt
                    ? `Your waitlist free month is active through ${new Date(entitlement.trialExpiresAt).toLocaleDateString()}.`
                    : 'Your premium access is active. You can restore purchases or open App Store subscription management below.'}
              </p>

              <div className="mt-5 space-y-3">
                {nativeBillingReady ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleRestorePurchases()}
                      disabled={isRestoringPurchases}
                      className="w-full"
                    >
                      {isRestoringPurchases ? (
                        <>
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                          Restoring purchases...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 size-4" />
                          Restore Purchases
                        </>
                      )}
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleManageSubscription()}
                      disabled={!managementUrl || isLoadingManagementUrl}
                      className="w-full"
                    >
                      {isLoadingManagementUrl ? (
                        <>
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                          Loading subscription link...
                        </>
                      ) : (
                        <>
                          <ExternalLink className="mr-2 size-4" />
                          Manage in App Store
                        </>
                      )}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    onClick={() => router.push('/upgrade')}
                    className="w-full"
                  >
                    Open Upgrade Screen
                  </Button>
                )}

                {billingError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
                    {billingError}
                  </div>
                ) : null}

                {!nativeBillingReady ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                    Subscription purchases and restore flow run inside the iOS app shell after RevenueCat and App Store products are fully configured.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {/* Profile */}
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

        <div className="rounded-3xl border border-red-200 bg-red-50/70 p-6 shadow-sm dark:border-red-900 dark:bg-red-950/15">
          <div className="flex items-start gap-3">
            <div className="mt-1 flex size-10 items-center justify-center rounded-xl border border-red-200 bg-white text-red-600 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
              <AlertTriangle className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-semibold text-foreground">Delete Account</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Permanently delete your SeekEatz account and associated in-app data. This does not cancel an App Store subscription. If you subscribed through Apple, cancel it separately in your Apple account.
              </p>

              <div className="mt-5 space-y-3">
                <div>
                  <Label htmlFor="delete-confirmation" className="text-sm font-medium">
                    Type <span className="font-semibold text-foreground">DELETE</span> to confirm
                  </Label>
                  <Input
                    id="delete-confirmation"
                    value={deleteConfirmation}
                    onChange={(e) => setDeleteConfirmation(e.target.value)}
                    placeholder="DELETE"
                    className="mt-2 h-12 bg-background"
                  />
                </div>

                {deleteError ? (
                  <div className="rounded-2xl border border-red-200 bg-white/80 p-4 text-sm text-red-600 dark:bg-red-950/20 dark:text-red-300">
                    {deleteError}
                  </div>
                ) : null}

                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleDeleteAccount()}
                  disabled={isDeleting}
                  className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/20"
                >
                  {isDeleting ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-current" />
                      Deleting account...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 size-4" />
                      Delete Account
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

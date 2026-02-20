/**
 * Client-side helper to claim anonymous data after authentication
 */

import { getDeviceId } from './deviceId';
import { resetFreeUseCount } from './freeUses';

/**
 * Claim anonymous data for authenticated user
 * Calls the server endpoint to claim saved_meals, daily_logs, user_favorites
 * Resets free use count after successful claim
 */
export async function claimAnonymousData(): Promise<boolean> {
  try {
    const deviceId = getDeviceId();

    if (!deviceId) {
      console.warn('No device ID found - nothing to claim');
      return false;
    }

    const response = await fetch('/api/claim-anon-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ device_id: deviceId }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.warn('Anonymous data claim skipped (server endpoint may not be configured).');
      return false;
    }

    // Success - reset free use count
    resetFreeUseCount();
    console.log('Successfully claimed anonymous data');
    return true;
  } catch (error) {
    console.error('Error claiming anonymous data:', error);
    return false;
  }
}


/**
 * Data query helpers for saved_meals, daily_logs, user_favorites
 * Handles both authenticated (user_id) and anonymous (device_id) queries
 */

import { createClient } from '@/utils/supabase/client';
import { getDeviceId } from './deviceId';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Get the appropriate query filter for data ownership
 * Returns a query builder with the correct filter applied
 */
export async function getDataQueryFilter<T>(
  supabase: SupabaseClient,
  tableName: 'saved_meals' | 'daily_logs' | 'user_favorites'
) {
  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  
  if (user) {
    // Authenticated: filter by user_id
    return supabase
      .from(tableName)
      .select('*')
      .eq('user_id', user.id);
  } else {
    // Anonymous: filter by device_id and user_id is null
    const deviceId = getDeviceId();
    if (!deviceId) {
      // No device ID - return empty query
      return supabase
        .from(tableName)
        .select('*')
        .eq('id', 'no-device-id'); // This will return no results
    }
    return supabase
      .from(tableName)
      .select('*')
      .is('user_id', null)
      .eq('device_id', deviceId);
  }
}

/**
 * Insert data with appropriate user_id/device_id
 * Returns the insert query builder
 */
export async function insertDataWithOwnership<T>(
  supabase: SupabaseClient,
  tableName: 'saved_meals' | 'daily_logs' | 'user_favorites',
  data: any
) {
  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  
  const insertData: any = { ...data };
  
  if (user) {
    // Authenticated: use user_id
    insertData.user_id = user.id;
    insertData.device_id = null; // Clear device_id when authenticated
  } else {
    // Anonymous: use device_id, user_id is null
    const deviceId = getDeviceId();
    insertData.user_id = null;
    insertData.device_id = deviceId;
  }
  
  return supabase
    .from(tableName)
    .insert(insertData);
}

/**
 * Delete data with appropriate ownership check
 */
export async function deleteDataWithOwnership(
  supabase: SupabaseClient,
  tableName: 'saved_meals' | 'daily_logs' | 'user_favorites',
  id: string
) {
  // Check if user is authenticated
  const { data: { user } } = await supabase.auth.getUser();
  
  let query = supabase
    .from(tableName)
    .delete()
    .eq('id', id);
  
  if (user) {
    // Authenticated: also check user_id
    query = query.eq('user_id', user.id);
  } else {
    // Anonymous: check device_id and user_id is null
    const deviceId = getDeviceId();
    query = query.is('user_id', null).eq('device_id', deviceId);
  }
  
  return query;
}

/**
 * Get daily logs for a specific date range (UTC)
 * Computes totals by filtering logged_at between start and end of day in UTC
 */
export async function getDailyLogsForDate(
  supabase: SupabaseClient,
  dateStr: string // YYYY-MM-DD format
) {
  // Parse date and create UTC range
  const date = new Date(dateStr + 'T00:00:00Z');
  const startUtc = new Date(date);
  startUtc.setUTCHours(0, 0, 0, 0);
  
  const endUtc = new Date(date);
  endUtc.setUTCHours(23, 59, 59, 999);
  
  // Check if user is authenticated - REQUIRED for user scoping
  const { data: { user } } = await supabase.auth.getUser();
  
  // Debug log
  console.log("LOG FETCH user_id", user?.id);
  
  let query = supabase
    .from('daily_logs')
    .select('*')
    .gte('logged_at', startUtc.toISOString())
    .lte('logged_at', endUtc.toISOString());
  
  if (user) {
    // Authenticated: filter by user_id (REQUIRED to prevent cross-account bleed)
    query = query.eq('user_id', user.id);
  } else {
    // Anonymous: filter by device_id and user_id is null
    const deviceId = getDeviceId();
    query = query.is('user_id', null).eq('device_id', deviceId);
  }
  
  return query;
}


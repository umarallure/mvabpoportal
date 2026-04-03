/**
 * Attorney Profile API Client
 * Handles direct communication with Supabase database
 */

import { supabase } from './supabase'

export interface AttorneyProfileData {
  // Tab 1: General Information
  profile_photo_url?: string | null
  full_name: string
  firm_name: string
  bar_association_number: string
  professional_bio?: string | null
  years_experience?: number | null
  languages_spoken: string[]
  primary_email: string
  direct_phone: string
  office_address: string
  website_url?: string | null
  preferred_contact_method?: 'email' | 'phone' | 'text' | null
  assistant_name?: string | null
  assistant_email?: string | null
  
  // Tab 2: Expertise & Jurisdiction
  licensed_states: string[]
  primary_city: string
  counties_covered?: string[]
  federal_court_admissions?: string | null
  primary_practice_focus: string
  injury_categories: string[]
  exclusionary_criteria?: string[]
  minimum_case_value?: number | null
  
  // Tab 3: Capacity & Performance
  availability_status: 'accepting' | 'at_capacity' | 'on_leave'
  firm_size?: 'solo' | 'small' | 'medium' | 'large' | null
  case_management_software?: string | null
  insurance_carriers_handled?: string[]
  litigation_style?: number | null
  largest_settlement_amount?: number | null
  avg_time_to_close?: string | null
}

export type AttorneyProfileRow = AttorneyProfileData & {
  user_id: string
}

/**
 * Save or update attorney profile using Supabase client
 */
export async function saveAttorneyProfile(
  userId: string,
  data: Partial<AttorneyProfileData>
): Promise<AttorneyProfileRow> {
  const { data: profile, error } = await supabase
    .from('attorney_profiles')
    .upsert({
      user_id: userId,
      ...data
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to save attorney profile')
  }

  return profile as AttorneyProfileRow
}

/**
 * Partially update attorney profile without touching other columns.
 * This is important for per-tab saves so we don't overwrite other tab fields.
 */
export async function patchAttorneyProfile(
  userId: string,
  data: Partial<AttorneyProfileData>
): Promise<AttorneyProfileRow> {
  const { data: profile, error } = await supabase
    .from('attorney_profiles')
    .update(data)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to update attorney profile')
  }

  return profile as AttorneyProfileRow
}

/**
 * Get attorney profile for current user
 */
export async function getAttorneyProfile(userId: string): Promise<AttorneyProfileRow | null> {
  const { data: profile, error } = await supabase
    .from('attorney_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Failed to fetch attorney profile')
  }

  return profile as AttorneyProfileRow | null
}

/**
 * Update only availability status (quick toggle)
 */
export async function updateAvailabilityStatus(
  userId: string,
  status: 'accepting' | 'at_capacity' | 'on_leave'
): Promise<AttorneyProfileRow> {
  const { data: profile, error } = await supabase
    .from('attorney_profiles')
    .update({ availability_status: status })
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to update availability status')
  }

  return profile as AttorneyProfileRow
}

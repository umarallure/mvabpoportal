import { computed, ref, readonly } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import type { Session, User } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'

const AUTH_CONTEXT_STORAGE_KEY = 'ap-auth-context-v1'

export type AppRole = 'super_admin' | 'admin' | 'lawyer' | 'agent' | 'accounts' | 'publisher_admin' | 'publisher_closer'

export type AppUserProfile = {
  user_id: string
  email: string
  display_name: string | null
  role: AppRole | null
  center_id: string | null
  is_super_admin: boolean | null
  account_status: string | null
} | null

export type AppCenterContext = {
  id: string
  center_name: string | null
  lead_vendor: string | null
  contact_email: string | null
} | null

type AuthState = {
  ready: boolean
  loading: boolean
  user: User | null
  session: Session | null
  profile: AppUserProfile
  centerContext: AppCenterContext
  publisherFeaturesReady: boolean
  publisherFeatures: Record<string, boolean>
}

type CachedAuthContext = {
  user_id: string
  profile: NonNullable<AppUserProfile>
  centerContext: AppCenterContext
}

const normalizeString = (value: unknown) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

const readCachedContext = (): CachedAuthContext | null => {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(AUTH_CONTEXT_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CachedAuthContext
  } catch {
    return null
  }
}

const clearCachedContext = () => {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(AUTH_CONTEXT_STORAGE_KEY)
}

const _useAuth = () => {
  const state = ref<AuthState>({
    ready: false,
    loading: true,
    user: null,
    session: null,
    profile: null,
    centerContext: null,
    publisherFeaturesReady: false,
    publisherFeatures: {}
  })

  const persistContext = () => {
    if (typeof window === 'undefined') return

    if (!state.value.user || !state.value.profile) {
      clearCachedContext()
      return
    }

    const payload: CachedAuthContext = {
      user_id: state.value.user.id,
      profile: state.value.profile,
      centerContext: state.value.centerContext
    }

    window.localStorage.setItem(AUTH_CONTEXT_STORAGE_KEY, JSON.stringify(payload))
  }

  const hydrateFromCache = (userId: string) => {
    const cached = readCachedContext()
    if (!cached || cached.user_id !== userId) return false

    state.value.profile = cached.profile
    state.value.centerContext = cached.centerContext
    return true
  }

  const resetContext = () => {
    state.value.profile = null
    state.value.centerContext = null
    state.value.publisherFeaturesReady = false
    state.value.publisherFeatures = {}
    clearCachedContext()
  }

  const loadPublisherFeatures = async () => {
    state.value.publisherFeaturesReady = false
    state.value.publisherFeatures = {}

    const role = state.value.profile?.role
    if (!state.value.user || (role !== 'publisher_admin' && role !== 'publisher_closer')) {
      state.value.publisherFeaturesReady = true
      return
    }

    const { data, error } = await supabase.rpc('get_my_publisher_features')
    if (error) {
      console.warn('[auth] publisher feature lookup failed closed', error.message)
      return
    }

    state.value.publisherFeatures = Object.fromEntries(
      ((data ?? []) as Array<{ feature_key: string, enabled: boolean }>)
        .map(row => [row.feature_key, row.enabled === true])
    )
    state.value.publisherFeaturesReady = true
  }

  const loadContext = async (options: { preferCache?: boolean } = {}) => {
    if (!state.value.user) {
      resetContext()
      console.info('[auth] no user found, clearing profile')
      return
    }

    if (options.preferCache && hydrateFromCache(state.value.user.id)) {
      console.info('[auth] hydrated profile from local cache')
      await loadPublisherFeatures()
      return
    }

    console.info('[auth] loading profile for user', state.value.user.id)

    const { data, error } = await supabase
      .from('app_users')
      .select('user_id,email,display_name,role,center_id,is_super_admin,account_status')
      .eq('user_id', state.value.user.id)
      .maybeSingle()

    if (error) {
      console.warn('[auth] failed to load profile', error.message)
      resetContext()
      return
    }

    if (!data) {
      resetContext()
      return
    }

    const row = data as Record<string, unknown>
    state.value.profile = {
      user_id: String(row.user_id),
      email: String(row.email ?? ''),
      display_name: normalizeString(row.display_name),
      role: (row.role ?? null) as AppRole | null,
      center_id: normalizeString(row.center_id),
      is_super_admin: (row.is_super_admin ?? null) as boolean | null,
      account_status: normalizeString(row.account_status)
    }

    const centerId = state.value.profile.center_id
    if (centerId) {
      const { data: center, error: centerError } = await supabase
        .from('centers')
        .select('id,center_name,lead_vendor,contact_email')
        .eq('id', centerId)
        .maybeSingle()

      if (centerError) {
        console.warn('[auth] failed to load center context', centerError.message)
        state.value.centerContext = null
      } else if (center) {
        const centerRow = center as Record<string, unknown>
        state.value.centerContext = {
          id: String(centerRow.id),
          center_name: normalizeString(centerRow.center_name),
          lead_vendor: normalizeString(centerRow.lead_vendor),
          contact_email: normalizeString(centerRow.contact_email)
        }
      } else {
        state.value.centerContext = null
      }
    } else {
      state.value.centerContext = null
    }

    persistContext()
    await loadPublisherFeatures()
    console.info('[auth] profile loaded', state.value.profile)
  }

  const init = async () => {
    if (state.value.ready) return

    state.value.loading = true
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error

    state.value.session = data.session
    state.value.user = data.session?.user ?? null
    await loadContext({ preferCache: true })
    state.value.ready = true
    state.value.loading = false

    supabase.auth.onAuthStateChange((_event, session) => {
      state.value.session = session
      state.value.user = session?.user ?? null
      loadContext({ preferCache: true }).catch(() => {
        resetContext()
      })
      state.value.ready = true
      state.value.loading = false
    })
  }

  const signInWithPassword = async (email: string, password: string) => {
    state.value.loading = true
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    state.value.loading = false

    if (error) throw error

    state.value.session = data.session
    state.value.user = data.user
    await loadContext()
    state.value.ready = true
  }

  const signOut = async () => {
    state.value.loading = true
    const { error } = await supabase.auth.signOut()
    state.value.loading = false
    if (error) throw error
    state.value.session = null
    state.value.user = null
    resetContext()
  }

  const canSeeAll = computed(() => {
    const role = state.value.profile?.role
    return role === 'super_admin' || role === 'admin' || Boolean(state.value.profile?.is_super_admin)
  })

  const isPublisherRole = computed(() => {
    const role = state.value.profile?.role
    return role === 'publisher_admin' || role === 'publisher_closer'
  })

  const isPublisherCloser = computed(() => {
    return state.value.profile?.role === 'publisher_closer'
  })

  const resolvedLeadVendor = computed(() => {
    if (canSeeAll.value) return null
    return normalizeString(state.value.centerContext?.lead_vendor)
  })

  const hasPublisherFeature = (featureKey: string) => computed(() => {
    return state.value.publisherFeaturesReady && state.value.publisherFeatures[featureKey] === true
  })

  return {
    state: readonly(state),
    init,
    canSeeAll,
    isPublisherRole,
    isPublisherCloser,
    resolvedLeadVendor,
    hasPublisherFeature,
    refreshProfile: loadContext,
    signInWithPassword,
    signOut
  }
}

export const useAuth = createSharedComposable(_useAuth)
